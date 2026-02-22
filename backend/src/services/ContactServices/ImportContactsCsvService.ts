import fs from "fs/promises";
import { Op, Transaction } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

interface ParsedCsvRow {
  [key: string]: string;
}

interface ContactImportCandidate {
  name: string;
  number: string;
  email: string;
}

interface ExtractContactsResult {
  contacts: ContactImportCandidate[];
  totalRows: number;
  parsedPhones: number;
  ignoredInvalidPhones: number;
  ignoredDuplicatesInCsv: number;
}

export interface ImportContactsCsvResult {
  totalRows: number;
  parsedPhones: number;
  ignoredInvalidPhones: number;
  ignoredDuplicatesInCsv: number;
  createdContacts: number;
  updatedContacts: number;
  mergedContacts: number;
}

const isPopulated = (value?: string): boolean =>
  typeof value === "string" && value.trim() !== "";

const isValidEmail = (value?: string): boolean =>
  isPopulated(value) && /\S+@\S+\.\S+/.test(String(value).trim());

const isWeakName = (name?: string): boolean => {
  if (!isPopulated(name)) return true;

  const sanitized = String(name).trim();
  return /^\d+$/.test(sanitized) || !/[A-Za-zÀ-ÿ0-9]/.test(sanitized);
};

const parseCsvContent = (content: string): ParsedCsvRow[] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotedField = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"") {
      if (inQuotedField && nextChar === "\"") {
        currentField += "\"";
        index += 1;
      } else {
        inQuotedField = !inQuotedField;
      }
      continue;
    }

    if (char === "," && !inQuotedField) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n" && !inQuotedField) {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    if (char === "\r" && !inQuotedField) {
      continue;
    }

    currentField += char;
  }

  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const headerRow = rows[0].map((header, idx) =>
    idx === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim()
  );

  return rows.slice(1).reduce<ParsedCsvRow[]>((acc, row) => {
    const parsed: ParsedCsvRow = {};
    let hasAnyValue = false;

    headerRow.forEach((header, idx) => {
      if (!header) {
        return;
      }

      const value = row[idx] ?? "";
      parsed[header] = value;
      if (value.trim() !== "") {
        hasAnyValue = true;
      }
    });

    if (hasAnyValue) {
      acc.push(parsed);
    }

    return acc;
  }, []);
};

export const normalizeBrazilianWhatsappNumber = (
  rawValue?: string
): string | null => {
  if (!isPopulated(rawValue)) {
    return null;
  }

  let digits = String(rawValue).replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  digits = digits.replace(/^00+/, "");

  // Remove "0 + operadora + DDD + numero" (ex.: 01451991311500).
  if (/^0\d{2}\d{10,11}$/.test(digits)) {
    digits = digits.slice(3);
  } else if (/^0\d{10,11}$/.test(digits)) {
    digits = digits.slice(1);
  } else {
    digits = digits.replace(/^0+/, "");
  }

  let nationalDigits = digits;
  if (nationalDigits.startsWith("55")) {
    nationalDigits = nationalDigits.slice(2);
  }

  // Converte DDD + 9 + 8 digitos para DDD + 8 digitos.
  if (nationalDigits.length === 11 && nationalDigits[2] === "9") {
    nationalDigits = `${nationalDigits.slice(0, 2)}${nationalDigits.slice(3)}`;
  }

  if (nationalDigits.length !== 10) {
    return null;
  }

  if (/^(0800|800|0300|3003|4004|0500)/.test(nationalDigits)) {
    return null;
  }

  const normalized = `55${nationalDigits}`;
  return /^55\d{10}$/.test(normalized) ? normalized : null;
};

const buildContactName = (row: ParsedCsvRow, fallbackNumber: string): string => {
  const fullName = [
    row["First Name"],
    row["Middle Name"],
    row["Last Name"]
  ]
    .map(part => (part || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const fallbackCandidates = [
    fullName,
    (row["Organization Name"] || "").trim(),
    (row["Nickname"] || "").trim(),
    (row["File As"] || "").trim(),
    fallbackNumber
  ];

  const firstMeaningful = fallbackCandidates.find(value => !isWeakName(value));
  return (firstMeaningful || fallbackNumber).trim();
};

const pickEmail = (row: ParsedCsvRow, emailColumns: string[]): string => {
  for (const column of emailColumns) {
    const candidate = (row[column] || "").trim();
    if (isValidEmail(candidate)) {
      return candidate;
    }
  }

  return "";
};

const extractContactsFromGoogleCsv = (csvContent: string): ExtractContactsResult => {
  const parsedRows = parseCsvContent(csvContent);

  if (parsedRows.length === 0) {
    return {
      contacts: [],
      totalRows: 0,
      parsedPhones: 0,
      ignoredInvalidPhones: 0,
      ignoredDuplicatesInCsv: 0
    };
  }

  const availableColumns = Object.keys(parsedRows[0]);
  const phoneColumns = availableColumns.filter(column =>
    /^Phone \d+ - Value$/i.test(column)
  );
  const emailColumns = availableColumns.filter(column =>
    /^E-mail \d+ - Value$/i.test(column)
  );

  if (phoneColumns.length === 0) {
    throw new AppError("ERR_CONTACTS_CSV_PHONE_COLUMN_NOT_FOUND", 400);
  }

  const contactsByNumber = new Map<string, ContactImportCandidate>();
  let parsedPhones = 0;
  let ignoredInvalidPhones = 0;
  let ignoredDuplicatesInCsv = 0;

  parsedRows.forEach(row => {
    const rowEmail = pickEmail(row, emailColumns);

    phoneColumns.forEach(column => {
      const rawPhone = row[column];
      if (!isPopulated(rawPhone)) {
        return;
      }

      parsedPhones += 1;

      const normalizedNumber = normalizeBrazilianWhatsappNumber(rawPhone);
      if (!normalizedNumber) {
        ignoredInvalidPhones += 1;
        return;
      }

      const existing = contactsByNumber.get(normalizedNumber);
      const candidateName = buildContactName(row, normalizedNumber);

      if (existing) {
        ignoredDuplicatesInCsv += 1;

        if (isWeakName(existing.name) && !isWeakName(candidateName)) {
          existing.name = candidateName;
        }

        if (!isValidEmail(existing.email) && isValidEmail(rowEmail)) {
          existing.email = rowEmail;
        }

        return;
      }

      contactsByNumber.set(normalizedNumber, {
        name: candidateName,
        number: normalizedNumber,
        email: rowEmail
      });
    });
  });

  return {
    contacts: Array.from(contactsByNumber.values()),
    totalRows: parsedRows.length,
    parsedPhones,
    ignoredInvalidPhones,
    ignoredDuplicatesInCsv
  };
};

const mergeContactIntoPrimary = async (
  primaryContact: Contact,
  duplicateContact: Contact,
  transaction: Transaction
): Promise<void> => {
  await Ticket.update(
    { contactId: primaryContact.id },
    {
      where: {
        contactId: duplicateContact.id,
        companyId: (duplicateContact as any).companyId
      },
      transaction
    }
  );

  await ContactCustomField.update(
    { contactId: primaryContact.id },
    { where: { contactId: duplicateContact.id }, transaction }
  );

  await Message.update(
    { contactId: primaryContact.id },
    { where: { contactId: duplicateContact.id }, transaction }
  );

  await duplicateContact.destroy({ transaction });
};

const mergeContactDataIntoPrimary = async (
  primaryContact: Contact,
  duplicateContact: Contact,
  transaction: Transaction
): Promise<boolean> => {
  const nextValues: Partial<ContactImportCandidate> = {};

  if (isWeakName(primaryContact.name) && !isWeakName(duplicateContact.name)) {
    nextValues.name = duplicateContact.name;
  }

  if (!isValidEmail(primaryContact.email) && isValidEmail(duplicateContact.email)) {
    nextValues.email = duplicateContact.email;
  }

  if (Object.keys(nextValues).length === 0) {
    return false;
  }

  await primaryContact.update(nextValues, { transaction });
  return true;
};

const buildWithNinthDigitVariant = (normalizedNumber: string): string => {
  const ddd = normalizedNumber.slice(2, 4);
  const localNumber = normalizedNumber.slice(4);
  return `55${ddd}9${localNumber}`;
};

const cleanupExistingDuplicatesByNormalizedNumber = async (
  companyId: number
): Promise<
  Pick<ImportContactsCsvResult, "updatedContacts" | "mergedContacts">
> => {
  const counters = {
    updatedContacts: 0,
    mergedContacts: 0
  };

  const contacts = await Contact.findAll({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  const groupsByNormalizedNumber = new Map<string, Contact[]>();

  contacts.forEach(contact => {
    const normalized = normalizeBrazilianWhatsappNumber(contact.number);
    if (!normalized) {
      return;
    }

    if (!groupsByNormalizedNumber.has(normalized)) {
      groupsByNormalizedNumber.set(normalized, []);
    }

    groupsByNormalizedNumber.get(normalized)?.push(contact);
  });

  for (const [normalizedNumber, groupedContacts] of groupsByNormalizedNumber) {
    if (groupedContacts.length === 0) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async transaction => {
      const canonicalPrimary =
        groupedContacts.find(contact => contact.number === normalizedNumber) ||
        groupedContacts[0];

      if (canonicalPrimary.number !== normalizedNumber) {
        await canonicalPrimary.update({ number: normalizedNumber }, { transaction });
        counters.updatedContacts += 1;
      }

      for (const duplicateContact of groupedContacts) {
        if (duplicateContact.id === canonicalPrimary.id) {
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const mergedData = await mergeContactDataIntoPrimary(
          canonicalPrimary,
          duplicateContact,
          transaction
        );

        if (mergedData) {
          counters.updatedContacts += 1;
        }

        // eslint-disable-next-line no-await-in-loop
        await mergeContactIntoPrimary(canonicalPrimary, duplicateContact, transaction);
        counters.mergedContacts += 1;
      }
    });
  }

  return counters;
};

const cleanupExactDuplicateNumbers = async (
  companyId: number
): Promise<
  Pick<ImportContactsCsvResult, "updatedContacts" | "mergedContacts">
> => {
  const counters = {
    updatedContacts: 0,
    mergedContacts: 0
  };

  type DuplicateNumberRow = {
    number: string;
    keepId: number;
  };

  const [duplicateRows] = await sequelize.query(
    "SELECT number, MIN(id) AS keepId FROM Contacts WHERE companyId = :companyId GROUP BY number HAVING COUNT(*) > 1",
    { replacements: { companyId } }
  );

  for (const row of duplicateRows as DuplicateNumberRow[]) {
    if (!isPopulated(row.number)) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async transaction => {
      const keepId = Number(row.keepId);
      const keepContact = await Contact.findByPk(keepId, { transaction });
      if (!keepContact) {
        return;
      }

      const duplicateContacts = await Contact.findAll({
        where: {
          companyId,
          number: row.number,
          id: {
            [Op.ne]: keepId
          }
        },
        order: [["id", "ASC"]],
        transaction
      });

      for (const duplicateContact of duplicateContacts) {
        // eslint-disable-next-line no-await-in-loop
        const mergedData = await mergeContactDataIntoPrimary(
          keepContact,
          duplicateContact,
          transaction
        );

        if (mergedData) {
          counters.updatedContacts += 1;
        }

        // eslint-disable-next-line no-await-in-loop
        await mergeContactIntoPrimary(keepContact, duplicateContact, transaction);
        counters.mergedContacts += 1;
      }
    });
  }

  return counters;
};

const persistImportedContacts = async (
  contacts: ContactImportCandidate[],
  companyId: number
): Promise<Pick<ImportContactsCsvResult, "createdContacts" | "updatedContacts" | "mergedContacts">> => {
  const counters = {
    createdContacts: 0,
    updatedContacts: 0,
    mergedContacts: 0
  };

  const exactCleanupCounters = await cleanupExactDuplicateNumbers(companyId);
  counters.updatedContacts += exactCleanupCounters.updatedContacts;
  counters.mergedContacts += exactCleanupCounters.mergedContacts;

  const cleanupCounters = await cleanupExistingDuplicatesByNormalizedNumber(companyId);
  counters.updatedContacts += cleanupCounters.updatedContacts;
  counters.mergedContacts += cleanupCounters.mergedContacts;

  for (const candidate of contacts) {
    // Cada contato e tratado em transacao isolada para manter consistencia em merges.
    // Isso evita perder vinculacoes em caso de erro em um item especifico.
    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async transaction => {
      const wrongVariant = buildWithNinthDigitVariant(candidate.number);

      const relatedContacts = await Contact.findAll({
        where: {
          companyId,
          number: {
            [Op.in]: [candidate.number, wrongVariant]
          }
        },
        order: [["id", "ASC"]],
        transaction
      });

      const canonicalContact =
        relatedContacts.find(contact => contact.number === candidate.number) || null;
      const duplicateContacts = relatedContacts.filter(
        contact => contact.id !== canonicalContact?.id
      );

      if (!canonicalContact && duplicateContacts.length === 0) {
        await Contact.create(
          {
            name: candidate.name,
            number: candidate.number,
            email: candidate.email,
            companyId
          },
          { transaction }
        );

        counters.createdContacts += 1;
        return;
      }

      const targetContact = canonicalContact || duplicateContacts.shift() || null;
      if (!targetContact) {
        return;
      }

      const nextValues: Partial<ContactImportCandidate> = {};

      if (targetContact.number !== candidate.number) {
        nextValues.number = candidate.number;
      }

      if (isWeakName(targetContact.name) && !isWeakName(candidate.name)) {
        nextValues.name = candidate.name;
      }

      if (!isValidEmail(targetContact.email) && isValidEmail(candidate.email)) {
        nextValues.email = candidate.email;
      }

      if (Object.keys(nextValues).length > 0) {
        await targetContact.update(nextValues, { transaction });
        counters.updatedContacts += 1;
      }

      for (const duplicateContact of duplicateContacts) {
        if (duplicateContact.id === targetContact.id) {
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const mergedData = await mergeContactDataIntoPrimary(
          targetContact,
          duplicateContact,
          transaction
        );

        if (mergedData) {
          counters.updatedContacts += 1;
        }

        // eslint-disable-next-line no-await-in-loop
        await mergeContactIntoPrimary(targetContact, duplicateContact, transaction);
        counters.mergedContacts += 1;
      }
    });
  }

  return counters;
};

interface ImportContactsCsvRequest {
  filePath: string;
  companyId: number;
}

const ImportContactsCsvService = async ({
  filePath,
  companyId
}: ImportContactsCsvRequest
): Promise<ImportContactsCsvResult> => {
  const csvContent = await fs.readFile(filePath, "utf8");
  const extracted = extractContactsFromGoogleCsv(csvContent);
  const persisted = await persistImportedContacts(extracted.contacts, companyId);

  return {
    totalRows: extracted.totalRows,
    parsedPhones: extracted.parsedPhones,
    ignoredInvalidPhones: extracted.ignoredInvalidPhones,
    ignoredDuplicatesInCsv: extracted.ignoredDuplicatesInCsv,
    createdContacts: persisted.createdContacts,
    updatedContacts: persisted.updatedContacts,
    mergedContacts: persisted.mergedContacts
  };
};

export default ImportContactsCsvService;
