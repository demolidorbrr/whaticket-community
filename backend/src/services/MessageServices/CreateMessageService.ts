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

  const io = getIO();
  const companyId = message.ticket.companyId;
  const ticketRoomName = companyId
    ? getCompanyTicketRoom(companyId, message.ticketId)
    : message.ticketId.toString();
  const statusRoomName = companyId
    ? getCompanyStatusRoom(companyId, message.ticket.status)
    : message.ticket.status;
  const notificationRoomName = companyId
    ? getCompanyNotificationRoom(companyId)
    : "notification";

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

