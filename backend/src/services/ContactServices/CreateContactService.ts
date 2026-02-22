import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import { getTenantContext } from "../../libs/tenantContext";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
}

const CreateContactService = async ({
  name,
  number,
  email = "",
  extraInfo = []
}: Request): Promise<Contact> => {
  const tenantContext = getTenantContext();
  const companyId = tenantContext?.companyId ?? null;

  if (!companyId) {
    throw new AppError("ERR_COMPANY_REQUIRED", 400);
  }

  const numberExists = await Contact.findOne({
    where: { number, companyId }
  });

  if (numberExists) {
    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  const contact = await Contact.create(
    {
      name,
      number,
      companyId,
      email,
      extraInfo
    },
    {
      include: ["extraInfo"]
    }
  );

  return contact;
};

export default CreateContactService;
