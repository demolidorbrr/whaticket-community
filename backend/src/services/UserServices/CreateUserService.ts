import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import { getTenantContext } from "../../libs/tenantContext";

interface Request {
  email: string;
  password: string;
  name: string;
  queueIds?: number[];
  profile?: string;
  whatsappId?: number;
  companyId?: number;
}

interface Response {
  email: string;
  name: string;
  id: number;
  profile: string;
}

const CreateUserService = async ({
  email,
  password,
  name,
  queueIds = [],
  profile = "admin",
  whatsappId,
  companyId
}: Request): Promise<Response> => {
  const tenantContext = getTenantContext();
  const contextCompanyId = tenantContext?.companyId ?? null;
  const targetCompanyId = contextCompanyId || companyId || null;

  if (!targetCompanyId) {
    throw new AppError("ERR_COMPANY_REQUIRED", 400);
  }

  const schema = Yup.object().shape({
    name: Yup.string().required().min(2),
    email: Yup.string()
      .email()
      .required()
      .test(
        "Check-email",
        "An user with this email already exists.",
        async value => {
          if (!value) return false;
          const emailExists = await User.findOne({
            where: { email: value, companyId: targetCompanyId }
          });
          return !emailExists;
        }
      ),
    password: Yup.string().required().min(5)
  });

  try {
    await schema.validate({ email, password, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (whatsappId) {
    const whatsapp = await Whatsapp.findByPk(whatsappId, {
      attributes: ["id", "companyId"]
    });

    if (!whatsapp || (whatsapp as any).companyId !== targetCompanyId) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }
  }

  if (queueIds.length > 0) {
    const normalizedQueueIds = [...new Set(queueIds.map(id => Number(id)))];
    const queues = await Queue.findAll({
      where: { id: normalizedQueueIds, companyId: targetCompanyId },
      attributes: ["id"]
    });

    if (queues.length !== normalizedQueueIds.length) {
      throw new AppError("ERR_NO_QUEUE_FOUND", 404);
    }
  }

  const user = await User.create(
    {
      email,
      password,
      name,
      companyId: targetCompanyId,
      profile,
      whatsappId: whatsappId ? whatsappId : null
    },
    { include: ["queues", "whatsapp"] }
  );

  const normalizedQueueIds = [...new Set(queueIds.map(id => Number(id)))];
  await user.$set("queues", normalizedQueueIds);

  await user.reload();

  return SerializeUser(user);
};

export default CreateUserService;
