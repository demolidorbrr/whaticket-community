import { getIO } from "../libs/socket";
import {
  getCompanyNotificationRoom,
  getCompanyStatusRoom
} from "../libs/socketRooms";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import { whatsappProvider } from "../providers/WhatsApp";

const SetTicketMessagesAsRead = async (ticket: Ticket): Promise<void> => {
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

  if (!ticket.companyId) {
    // Security hardening: avoid emitting unread updates without tenant scope.
    logger.warn({
      info: "Skipping unread update socket emit without companyId",
      ticketId: ticket.id
    });
    return;
  }

  const io = getIO();
  const statusRoomName = getCompanyStatusRoom(ticket.companyId, ticket.status);
  const notificationRoomName = getCompanyNotificationRoom(ticket.companyId);

  io.to(statusRoomName).to(notificationRoomName).emit("ticket", {
    action: "updateUnread",
    ticketId: ticket.id
  });
};

export default SetTicketMessagesAsRead;

