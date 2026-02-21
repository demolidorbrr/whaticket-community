import AppError from "../../errors/AppError";
import { getTenantContext } from "../../libs/tenantContext";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { whatsappProvider } from "../../providers/WhatsApp";

const DeleteWhatsAppMessage = async (messageId: string): Promise<Message> => {
  const tenantContext = getTenantContext();
  const ticketInclude: Record<string, any> = {
    model: Ticket,
    as: "ticket",
    include: ["contact"]
  };

  if (
    tenantContext?.companyId &&
    tenantContext.profile !== "superadmin"
  ) {
    // Multi-tenant guard: authenticated users can only delete messages from their company.
    ticketInclude.where = { companyId: tenantContext.companyId };
    ticketInclude.required = true;
  }

  const message = await Message.findOne({
    where: { id: messageId },
    include: [ticketInclude]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;

  const chatId = `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`;

  await whatsappProvider.deleteMessage(
    ticket.whatsappId,
    chatId,
    message.id,
    message.fromMe
  );

  await message.update({ isDeleted: true });

  return message;
};

export default DeleteWhatsAppMessage;

