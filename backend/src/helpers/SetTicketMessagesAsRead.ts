import {
  emitToCompanyRooms,
  getCompanyNotificationRoom,
  getCompanyTicketsStatusRoom
} from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import { whatsappProvider } from "../providers/WhatsApp";

interface SetTicketMessagesAsReadOptions {
  syncSeen?: boolean;
}

const SetTicketMessagesAsRead = async (
  ticket: Ticket,
  options: SetTicketMessagesAsReadOptions = {}
): Promise<void> => {
  const { syncSeen = true } = options;

  await Message.update(
    { read: true },
    {
      where: {
        ticketId: ticket.id,
        read: false
      }
    }
  );

  await ticket.update({ unreadMessages: 0 });

  if (syncSeen) {
    try {
      if (ticket.whatsappId) {
        await whatsappProvider.sendSeen(
          ticket.whatsappId,
          `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`
        );
      }
    } catch (err) {
      logger.warn(
        `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
      );
    }
  }

  const companyId = (ticket as any).companyId as number;

  emitToCompanyRooms(
    companyId,
    [
      getCompanyTicketsStatusRoom(companyId, ticket.status),
      getCompanyNotificationRoom(companyId)
    ],
    "ticket",
    {
      action: "updateUnread",
      ticketId: ticket.id
    }
  );
};

export default SetTicketMessagesAsRead;
