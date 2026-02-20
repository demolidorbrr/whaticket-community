import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import { getTenantContext } from "../../libs/tenantContext";

const ShowWhatsAppService = async (id: string | number): Promise<Whatsapp> => {
  const tenantContext = getTenantContext();
  // Em requests autenticadas, impede acesso cruzado entre empresas.
  const where: { id: string | number; companyId?: number } = { id };

  if (tenantContext?.companyId) {
    where.companyId = tenantContext.companyId;
  }

  const whatsapp = await Whatsapp.findOne({
    where,
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      }
    ],
    order: [["queues", "name", "ASC"]]
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  return whatsapp;
};

export default ShowWhatsAppService;
