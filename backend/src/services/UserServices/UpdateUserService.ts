import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import ShowUserService from "./ShowUserService";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

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
  companyId?: number;
}

const UpdateUserService = async ({
  userData,
  userId
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId);

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

  try {
    await schema.validate({ email, password, profile, name });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (queueIds.length) {
    const validQueuesCount = await Queue.count({
      where: {
        id: { [Op.in]: queueIds },
        companyId: user.companyId
      }
    });

    if (validQueuesCount !== queueIds.length) {
      throw new AppError("ERR_INVALID_QUEUE_SELECTION", 400);
    }
  }

  if (whatsappId) {
    const whatsapp = await Whatsapp.findOne({
      where: {
        id: whatsappId,
        companyId: user.companyId
      }
    });

    if (!whatsapp) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }
  }

  await user.update({
    email,
    password,
    profile,
    name,
    whatsappId: whatsappId ? whatsappId : null
  });

  await user.$set("queues", queueIds);

  await user.reload({ include: ["queues", "whatsapp", "company"] });

  return SerializeUser(user);
};

export default UpdateUserService;

