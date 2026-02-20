import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ProcessQueueAssistantService from "../services/AIServices/ProcessQueueAssistantService";
import StartTicketSLAService from "../services/SLAServices/StartTicketSLAService";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";

type ChannelName = "whatsapp" | "instagram" | "messenger" | "webchat";

interface InboundPayload {
  channel: ChannelName;
  externalId?: string;
  number?: string;
  name?: string;
  body: string;
  queueId?: number;
  whatsappId?: number;
  messageId?: string;
  profilePicUrl?: string;
}

const makeMessageId = (channel: string): string =>
  `${channel}-in-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const getTokenFromRequest = (req: Request): string | undefined => {
  const rawAuth = req.headers.authorization;
  const bearer = rawAuth?.startsWith("Bearer ")
    ? rawAuth.slice("Bearer ".length)
    : undefined;

  const headerToken = req.headers["x-channel-token"];
  const explicitHeaderToken =
    typeof headerToken === "string" ? headerToken : undefined;

  return explicitHeaderToken || bearer;
};

export const inbound = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const expectedToken = process.env.CHANNEL_WEBHOOK_TOKEN;
  if (expectedToken) {
    const incomingToken = getTokenFromRequest(req);
    if (!incomingToken || incomingToken !== expectedToken) {
      throw new AppError("ERR_CHANNEL_UNAUTHORIZED", 401);
    }
  }

  const payload = req.body as InboundPayload;

  const schema = Yup.object().shape({
    channel: Yup.string()
      .oneOf(["whatsapp", "instagram", "messenger", "webchat"])
      .required(),
    externalId: Yup.string().notRequired(),
    number: Yup.string().notRequired(),
    name: Yup.string().notRequired(),
    body: Yup.string().required(),
    queueId: Yup.number().notRequired(),
    whatsappId: Yup.number().notRequired(),
    messageId: Yup.string().notRequired(),
    profilePicUrl: Yup.string().notRequired()
  });

  try {
    await schema.validate(payload);
  } catch (err: any) {
    throw new AppError(err.message, 400);
  }

  const channel = String(payload.channel).toLowerCase() as ChannelName;
  const isWhatsApp = channel === "whatsapp";
  const identity = isWhatsApp
    ? payload.number
    : payload.externalId || payload.number;

  if (!identity) {
    throw new AppError("ERR_CHANNEL_CONTACT_ID_REQUIRED", 400);
  }

  let whatsapp: Whatsapp | null = null;
  if (payload.whatsappId) {
    whatsapp = await Whatsapp.findByPk(payload.whatsappId);
  } else {
    whatsapp = await GetDefaultWhatsApp();
  }

  if (!whatsapp) {
    throw new AppError("ERR_NO_DEF_WAPP_FOUND", 404);
  }

  const contactNumber = isWhatsApp
    ? String(identity)
    : `${channel}:${String(identity)}`;

  const contact = await CreateOrUpdateContactService({
    name: payload.name || String(identity),
    number: contactNumber,
    profilePicUrl: payload.profilePicUrl,
    isGroup: false,
    keepNumberFormat: !isWhatsApp
  });

  const ticket = await FindOrCreateTicketService(contact, whatsapp.id, 1);
  await ticket.update({
    channel,
    queueId: payload.queueId || ticket.queueId,
    lastMessage: payload.body
  });

  await StartTicketSLAService(ticket, "omnichannel");

  const messageId = payload.messageId || makeMessageId(channel);

  await CreateMessageService({
    messageData: {
      id: messageId,
      ticketId: ticket.id,
      contactId: contact.id,
      body: payload.body,
      fromMe: false,
      read: false,
      mediaType: "chat",
      ack: 0
    }
  });

  await ProcessQueueAssistantService({
    ticket,
    messagePayload: {
      id: messageId,
      body: payload.body,
      fromMe: false,
      hasMedia: false,
      type: "chat",
      timestamp: Date.now(),
      from: String(identity),
      to: "inbox",
      ack: 0
    },
    contactPayload: {
      name: contact.name,
      number: contact.number,
      lid: contact.lid,
      profilePicUrl: contact.profilePicUrl,
      isGroup: false
    },
    whatsappId: whatsapp.id
  });

  return res.status(200).json({
    success: true,
    ticketId: ticket.id,
    messageId
  });
};

