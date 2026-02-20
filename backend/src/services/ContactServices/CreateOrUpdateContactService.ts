import { Op, UniqueConstraintError } from "sequelize";
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import { emitByCompany } from "../../helpers/SocketEmitByCompany";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  lid?: string;
  isGroup: boolean;
  keepNumberFormat?: boolean;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
}

const emitContact = (action: "update" | "create", contact: Contact) => {
  emitByCompany(contact.companyId, "contact", { action, contact });
};

const findContactByNumberOrLid = async (
  number?: string,
  lid?: string
): Promise<Contact | null> => {
  const whereConditions: Array<Record<string, string>> = [];

  if (number) {
    whereConditions.push({ number });
  }

  if (lid) {
    whereConditions.push({ lid });
  }

  if (!whereConditions.length) {
    return null;
  }

  return Contact.findOne({
    where: {
      [Op.or]: whereConditions
    }
  });
};

const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  lid,
  profilePicUrl,
  isGroup,
  keepNumberFormat = false,
  email = "",
  extraInfo = []
}: Request): Promise<Contact> => {
  const number =
    isGroup || keepNumberFormat
      ? rawNumber
      : rawNumber.replace(/[^0-9]/g, "");
  if (!number && !lid) throw new Error("Either number or lid must be provided");

  const [contactByNumber, contactByLid] = await Promise.all([
    number ? Contact.findOne({ where: { number } }) : null,
    lid ? Contact.findOne({ where: { lid } }) : null
  ]);

  const shouldMerge =
    contactByNumber && contactByLid && contactByNumber.id !== contactByLid.id;

  if (shouldMerge) {
    await Ticket.update(
      { contactId: contactByNumber.id },
      { where: { contactId: contactByLid.id } }
    );

    await contactByLid.destroy();

    await contactByNumber.update({
      lid: contactByLid.lid,
      profilePicUrl
    });

    logger.info({
      info: "Merged contacts by number and lid",
      primaryContactId: contactByNumber.id,
      mergedContactId: contactByLid.id
    });

    emitContact("update", contactByNumber);

    return contactByNumber;
  }

  if (contactByNumber) {
    await contactByNumber.update({
      lid: lid || contactByNumber.lid,
      profilePicUrl
    });

    emitContact("update", contactByNumber);

    return contactByNumber;
  }

  if (contactByLid) {
    await contactByLid.update({
      number: number || contactByLid.number,
      profilePicUrl
    });

    emitContact("update", contactByLid);
    return contactByLid;
  }

  try {
    const created = await Contact.create({
      name,
      number,
      lid,
      profilePicUrl,
      email,
      isGroup,
      extraInfo
    });

    emitContact("create", created);
    return created;
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const existingContact = await findContactByNumberOrLid(number, lid);

      if (existingContact) {
        await existingContact.update({
          name: name || existingContact.name,
          number: number || existingContact.number,
          lid: lid || existingContact.lid,
          profilePicUrl: profilePicUrl || existingContact.profilePicUrl,
          email: email || existingContact.email,
          isGroup
        });

        emitContact("update", existingContact);
        return existingContact;
      }
    }

    throw error;
  }
};

export default CreateOrUpdateContactService;

