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
  id?: string;
  ticketId: number;
  body: string;
  contactId?: number;
  fromMe?: boolean;
  read?: boolean;
  mediaType?: string;
  mediaUrl?: string;
  ack?: number;
  quotedMsgId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Request {
  messageData: MessageData;
}

const createSyntheticMessageId = (
  baseId: string | undefined,
  ticketId: number
): string => {
  const normalizedBaseId = baseId && baseId.trim() ? baseId.trim() : "msg";
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${normalizedBaseId}-${ticketId}-${Date.now()}-${randomSuffix}`;
};

const resolveMessageDataToPersist = async (
  messageData: MessageData
): Promise<MessageData> => {
  const messageId = messageData.id?.trim();

  if (!messageId) {
    const generatedId = createSyntheticMessageId(undefined, messageData.ticketId);

    logger.warn({
      info: "Persisting message with generated id because provider id is missing",
      ticketId: messageData.ticketId,
      generatedId
    });

    return {
      ...messageData,
      id: generatedId
    };
  }

  const existingMessage = await Message.findByPk(messageId, {
    attributes: ["id", "ticketId", "body", "fromMe"]
  });

  if (!existingMessage) {
    return {
      ...messageData,
      id: messageId
    };
  }

  const sameTicket = Number(existingMessage.ticketId) === Number(messageData.ticketId);
  const sameBody = String(existingMessage.body || "") === String(messageData.body || "");
  const sameDirection =
    Boolean(existingMessage.fromMe) === Boolean(messageData.fromMe);

  if (sameTicket && sameBody && sameDirection) {
    return {
      ...messageData,
      id: messageId
    };
  }

  const generatedId = createSyntheticMessageId(messageId, messageData.ticketId);

  logger.warn({
    info: "Message id collision detected; preserving message with synthetic id",
    originalMessageId: messageId,
    generatedId,
    existingTicketId: existingMessage.ticketId,
    incomingTicketId: messageData.ticketId
  });

  return {
    ...messageData,
    id: generatedId
  };
};

const CreateMessageService = async ({
  messageData
}: Request): Promise<Message> => {
  const resolvedMessageData = await resolveMessageDataToPersist(messageData);

  if (!resolvedMessageData.id) {
    throw new Error("ERR_CREATING_MESSAGE_WITHOUT_ID");
  }

  await Message.upsert(resolvedMessageData);

  const message = await Message.findByPk(resolvedMessageData.id, {
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

