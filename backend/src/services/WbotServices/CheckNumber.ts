import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";

const CheckContactNumber = async (
  number: string,
  whatsappId?: number
): Promise<string> => {
  const selectedWhatsapp = whatsappId
    ? { id: whatsappId }
    : await GetDefaultWhatsApp();

  const validNumber = await whatsappProvider.checkNumber(
    selectedWhatsapp.id,
    number
  );
  return validNumber;
};

export default CheckContactNumber;
