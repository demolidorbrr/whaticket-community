import { getIO } from "../../libs/socket";
import {
  getCompanyNotificationRoom,
  getCompanyStatusRoom,
  getCompanyTicketRoom
} from "../../libs/socketRooms";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import { logger } from "../../utils/logger";

interface MessageData {
  id: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  quotedMsgId?: string;
}

interface Request {
  messageData: MessageData;
}

const CreateMessageService = async ({
  messageData
}: Request): Promise<Message> => {
  await Message.upsert(messageData);

  const message = await Message.findByPk(messageData.id, {
    include: [
      "contact",
      {
        model: Ticket,
        as: "ticket",
        include: [
          "contact",
          "queue",
          {
            model: User,
            as: "user",
            attributes: ["id", "name"]
          },
          {
            model: Whatsapp,
            as: "whatsapp",
            attributes: ["name"]
          }
        ]
      },
      {
        model: Message,
        as: "quotedMsg",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new Error("ERR_CREATING_MESSAGE");
  }

  const ticketPayload = {
    ...message.ticket.toJSON(),
    lastMessageAt: message.createdAt,
    lastMessageAtTs: new Date(message.createdAt).getTime()
  };

  const companyId = message.ticket.companyId;
  if (!companyId) {
    // Security hardening: never emit message events without tenant scope.
    logger.warn({
      info: "Skipping appMessage emit without companyId",
      messageId: message.id,
      ticketId: message.ticketId
    });
    return message;
  }

  const io = getIO();
  const ticketRoomName = getCompanyTicketRoom(companyId, message.ticketId);
  const statusRoomName = getCompanyStatusRoom(companyId, message.ticket.status);
  const notificationRoomName = getCompanyNotificationRoom(companyId);

  io.to(ticketRoomName)
    .to(statusRoomName)
    .to(notificationRoomName)
    .emit("appMessage", {
      action: "create",
      message,
      ticket: ticketPayload,
      contact: message.ticket.contact
    });

  return message;
};

export default CreateMessageService;

