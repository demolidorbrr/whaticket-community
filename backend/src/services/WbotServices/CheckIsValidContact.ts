import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";

const CheckIsValidContact = async (
  number: string,
  whatsappId?: number
): Promise<void> => {
  const selectedWhatsapp = whatsappId
    ? { id: whatsappId }
    : await GetDefaultWhatsApp();

  try {
    const isValidNumber = await whatsappProvider.checkNumber(
      selectedWhatsapp.id,
      number
    );
    if (!isValidNumber) {
      throw new AppError("invalidNumber");
    }
  } catch (err) {
    if (err.message === "invalidNumber") {
      throw new AppError("ERR_WAPP_INVALID_CONTACT");
    }
    throw new AppError("ERR_WAPP_CHECK_CONTACT");
  }
};

export default CheckIsValidContact;
