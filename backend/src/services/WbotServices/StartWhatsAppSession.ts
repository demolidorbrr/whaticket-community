import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { emitByCompany } from "../../helpers/SocketEmitByCompany";
import { logger } from "../../utils/logger";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  await whatsapp.update({ status: "OPENING" });

  emitByCompany(whatsapp.companyId, "whatsappSession", {
    action: "update",
    session: whatsapp
  });

  try {
    await whatsappProvider.init(whatsapp);
  } catch (err) {
    logger.error(err);
  }
};

