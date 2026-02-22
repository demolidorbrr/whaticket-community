import Whatsapp from "../../models/Whatsapp";
import { whatsappProvider } from "../../providers/WhatsApp";
import { emitToCompany } from "../../libs/socket";
import { logger } from "../../utils/logger";

export const StartWhatsAppSession = async (
  whatsapp: Whatsapp
): Promise<void> => {
  await whatsapp.update({ status: "OPENING" });

  emitToCompany((whatsapp as any).companyId, "whatsappSession", {
    action: "update",
    session: whatsapp
  });

  try {
    console.log("VAI!");
    await whatsappProvider.init(whatsapp);
  } catch (err) {
    logger.error(err);
  }
};
