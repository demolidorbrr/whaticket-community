import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
import { getTenantContext } from "../../libs/tenantContext";
import ValidateCompanyPlanLimitService from "../CompanyServices/ValidateCompanyPlanLimitService";
import Queue from "../../models/Queue";

interface Request {
  name: string;
  queueIds?: number[];
  greetingMessage?: string;
  farewellMessage?: string;
  status?: string;
  isDefault?: boolean;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

const CreateWhatsAppService = async ({
  name,
  status = "OPENING",
  queueIds = [],
  greetingMessage,
  farewellMessage,
  isDefault = false
}: Request): Promise<Response> => {
  const tenantContext = getTenantContext();

  if (!tenantContext?.companyId) {
    throw new AppError("ERR_TENANT_CONTEXT_REQUIRED", 500);
  }

  await ValidateCompanyPlanLimitService({
    companyId: tenantContext.companyId,
    resource: "connections"
  });

  if (queueIds.length) {
    const validQueuesCount = await Queue.count({
      where: {
        id: { [Op.in]: queueIds },
        companyId: tenantContext.companyId
      }
    });

    if (validQueuesCount !== queueIds.length) {
      throw new AppError("ERR_INVALID_QUEUE_SELECTION", 400);
    }
  }

  const schema = Yup.object().shape({
    name: Yup.string()
      .required()
      .min(2)
      .test(
        "Check-name",
        "This whatsapp name is already used.",
        async value => {
          if (!value) return false;
          // Nome unico por empresa para evitar conflito entre tenants.
          const nameExists = await Whatsapp.findOne({
            where: { name: value, companyId: tenantContext.companyId }
          });
          return !nameExists;
        }
      ),
    isDefault: Yup.boolean().required()
  });

  try {
    await schema.validate({ name, status, isDefault });
  } catch (err) {
    throw new AppError(err.message);
  }

  const whatsappFound = await Whatsapp.findOne({
    where: { companyId: tenantContext.companyId }
  });

  isDefault = !whatsappFound;

  let oldDefaultWhatsapp: Whatsapp | null = null;

  if (isDefault) {
    oldDefaultWhatsapp = await Whatsapp.findOne({
      where: { isDefault: true, companyId: tenantContext.companyId }
    });
    if (oldDefaultWhatsapp) {
      await oldDefaultWhatsapp.update({ isDefault: false });
    }
  }

  if (queueIds.length > 1 && !greetingMessage) {
    throw new AppError("ERR_WAPP_GREETING_REQUIRED");
  }

  const whatsapp = await Whatsapp.create(
    {
      name,
      status,
      greetingMessage,
      farewellMessage,
      isDefault,
      companyId: tenantContext.companyId
    },
    { include: ["queues"] }
  );

  await AssociateWhatsappQueue(whatsapp, queueIds);

  return { whatsapp, oldDefaultWhatsapp };
};

export default CreateWhatsAppService;

