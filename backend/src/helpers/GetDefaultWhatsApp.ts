import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import { getTenantContext } from "../libs/tenantContext";
import GetDefaultWhatsAppByUser from "./GetDefaultWhatsAppByUser";

const GetDefaultWhatsApp = async (userId?: number): Promise<Whatsapp> => {
  if (userId) {
    const whatsappByUser = await GetDefaultWhatsAppByUser(userId);
    if (whatsappByUser !== null) {
      return whatsappByUser;
    }
  }

  const tenantContext = getTenantContext();

  if (!tenantContext?.companyId) {
    const defaultWhatsapps = await Whatsapp.findAll({
      where: { isDefault: true },
      order: [["id", "ASC"]]
    });

    if (defaultWhatsapps.length > 1) {
      // Em ambiente multi-tenant sem contexto, o caller deve informar a conexao explicitamente.
      throw new AppError("ERR_WAPP_SELECTION_REQUIRED", 400);
    }

    if (defaultWhatsapps.length === 1) {
      return defaultWhatsapps[0];
    }
  }

  const defaultWhatsapp = await Whatsapp.findOne({
    where: {
      isDefault: true,
      ...(tenantContext?.companyId ? { companyId: tenantContext.companyId } : {})
    }
  });

  if (!defaultWhatsapp) {
    throw new AppError("ERR_NO_DEF_WAPP_FOUND");
  }

  return defaultWhatsapp;
};

export default GetDefaultWhatsApp;
