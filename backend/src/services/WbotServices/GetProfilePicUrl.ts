import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";

const GetProfilePicUrl = async (
  number: string,
  whatsappId?: number
): Promise<string> => {
  const selectedWhatsapp = whatsappId
    ? { id: whatsappId }
    : await GetDefaultWhatsApp();

  const profilePicUrl = await whatsappProvider.getProfilePicUrl(
    selectedWhatsapp.id,
    number
  );

  return profilePicUrl;
};

export default GetProfilePicUrl;
