import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import { getTenantContext } from "../../libs/tenantContext";

const DeleteWhatsAppService = async (id: string): Promise<void> => {
  const tenantContext = getTenantContext();
  // Em requests autenticadas, remove apenas conexao da empresa corrente.
  const where: { id: string; companyId?: number } = { id };

  if (tenantContext?.companyId) {
    where.companyId = tenantContext.companyId;
  }

  const whatsapp = await Whatsapp.findOne({
    where
  });

  if (!whatsapp) {
    throw new AppError("ERR_NO_WAPP_FOUND", 404);
  }

  await whatsapp.destroy();
};

export default DeleteWhatsAppService;
