import * as Yup from "yup";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import ShowUserService from "./ShowUserService";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";

interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  queueIds?: number[];
  whatsappId?: number;
}

interface Request {
  userData: UserData;
  userId: string | number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
}

const UpdateUserService = async ({
  userData,
  userId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId);
  const userCompanyId = (user as any).companyId as number | undefined;

  if (!userCompanyId) {
    throw new AppError("ERR_COMPANY_REQUIRED", 400);
  }

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string()
  });

  const {
    email,
    password,
    profile,
    name,
    queueIds = [],
    whatsappId
  } = userData;
  const normalizedQueueIds = [...new Set(queueIds.map(id => Number(id)))];

  try {
    await schema.validate({ email, password, profile, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (whatsappId) {
    const whatsapp = await Whatsapp.findByPk(whatsappId, {
      attributes: ["id", "companyId"]
    });

    if (!whatsapp || (whatsapp as any).companyId !== userCompanyId) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }
  }

  if (normalizedQueueIds.length > 0) {
    const queues = await Queue.findAll({
      where: { id: normalizedQueueIds, companyId: userCompanyId },
      attributes: ["id"]
    });

    if (queues.length !== normalizedQueueIds.length) {
      throw new AppError("ERR_NO_QUEUE_FOUND", 404);
    }
  }

  if (email && email !== user.email) {
    const existingUser = await User.findOne({
      where: {
        email,
        companyId: userCompanyId
      },
      attributes: ["id"]
    });

    if (existingUser && existingUser.id !== user.id) {
      throw new AppError("An user with this email already exists.");
    }
  }

  await user.update({
    email,
    password,
    profile,
    name,
    whatsappId: whatsappId ? whatsappId : null
  });

  await user.$set("queues", normalizedQueueIds);

  await user.reload();

  return SerializeUser(user);
};

export default UpdateUserService;
