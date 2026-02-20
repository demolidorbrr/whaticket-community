import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import { SerializeUser } from "../../helpers/SerializeUser";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import { getTenantContext } from "../../libs/tenantContext";
import GetDefaultCompanyIdService from "../CompanyServices/GetDefaultCompanyIdService";
import ValidateCompanyPlanLimitService from "../CompanyServices/ValidateCompanyPlanLimitService";

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
  companyId?: number;
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
  const resolvedCompanyId =
    companyId || tenantContext?.companyId || (await GetDefaultCompanyIdService());

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
            where: { email: value }
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

  await ValidateCompanyPlanLimitService({
    companyId: resolvedCompanyId,
    resource: "users"
  });

  if (queueIds.length) {
    const validQueuesCount = await Queue.count({
      where: {
        id: { [Op.in]: queueIds },
        companyId: resolvedCompanyId
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
        companyId: resolvedCompanyId
      }
    });

    if (!whatsapp) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }
  }

  const user = await User.create(
    {
      email,
      password,
      name,
      profile,
      companyId: resolvedCompanyId,
      whatsappId: whatsappId ? whatsappId : null
    },
    { include: ["queues", "whatsapp", "company"] }
  );

  await user.$set("queues", queueIds);

  await user.reload({ include: ["queues", "whatsapp", "company"] });

  return SerializeUser(user);
};

export default CreateUserService;

