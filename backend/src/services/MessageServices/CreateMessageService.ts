import {
  emitToCompanyRooms,
  getCompanyNotificationRoom,
  getCompanyTicketRoom,
  getCompanyTicketsStatusRoom
} from "../../libs/socket";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import Contact from "../../models/Contact";

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

  const ticketReference = await Ticket.findByPk(messageData.ticketId, {
    attributes: ["id", "companyId"]
  });
  const companyId = (ticketReference as any)?.companyId as number | undefined;

  const message = await Message.findByPk(messageData.id, {
    include: [
      {
        model: Contact,
        as: "contact",
        where: companyId ? { companyId } : undefined,
        required: false
      },
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
        include: [
          {
            model: Contact,
            as: "contact",
            where: companyId ? { companyId } : undefined,
            required: false
          }
        ]
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

  const messageCompanyId = (message.ticket as any).companyId as number;

  emitToCompanyRooms(
    messageCompanyId,
    [
      getCompanyTicketRoom(messageCompanyId, message.ticketId.toString()),
      getCompanyTicketsStatusRoom(messageCompanyId, message.ticket.status),
      getCompanyNotificationRoom(messageCompanyId)
    ],
    "appMessage",
    {
      action: "create",
      message,
      ticket: ticketPayload,
      contact: message.ticket.contact
    }
  );

  return message;
};

export default CreateMessageService;
