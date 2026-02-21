import { Request, Response } from "express";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import { getCompanyTicketRoom } from "../libs/socketRooms";
import Message from "../models/Message";
import { logger } from "../utils/logger";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import LogTicketEventService from "../services/TicketServices/LogTicketEventService";
import SendChannelMessageService from "../services/ChannelServices/SendChannelMessageService";
import AppError from "../errors/AppError";

type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string | string[];
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const normalizedBody = Array.isArray(body) ? body[0] : body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);
  const isWhatsAppChannel = !ticket.channel || ticket.channel === "whatsapp";

  SetTicketMessagesAsRead(ticket);

  if (medias && medias.length > 0) {
    if (!isWhatsAppChannel) {
      throw new AppError("ERR_CHANNEL_MEDIA_NOT_SUPPORTED", 400);
    }

    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({
          media,
          ticket,
          body: normalizedBody,
          quotedMsgId: quotedMsg?.id
        });
      })
    );
  } else {
    const sentMessage = isWhatsAppChannel
      ? await SendWhatsAppMessage({ body: normalizedBody, ticket, quotedMsg })
      : await SendChannelMessageService({ body: normalizedBody, ticket, quotedMsg });

    await CreateMessageService({
      messageData: {
        id: sentMessage.id,
        ticketId: ticket.id,
        contactId: ticket.contactId,
        body: sentMessage.body || normalizedBody,
        fromMe: true,
        read: true,
        mediaType: sentMessage.type,
        quotedMsgId: quotedMsg?.id,
        ack: sentMessage.ack !== undefined ? sentMessage.ack : 1
      }
    });
  }

  if (!ticket.firstHumanResponseAt) {
    await ticket.update({ firstHumanResponseAt: new Date(), slaDueAt: null });

    await LogTicketEventService({
      ticketId: ticket.id,
      queueId: ticket.queueId,
      userId: ticket.userId,
      eventType: "human_first_response",
      source: "agent"
    });
  } else if (ticket.slaDueAt) {
    await ticket.update({ slaDueAt: null });
  }

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;

  const message = await DeleteWhatsAppMessage(messageId);

  const companyId = message.ticket?.companyId;
  if (companyId) {
    const io = getIO();
    const ticketRoomName = getCompanyTicketRoom(companyId, message.ticketId);
    io.to(ticketRoomName).emit("appMessage", {
      action: "update",
      message
    });
  } else {
    // Security hardening: never emit message updates to non-tenant rooms.
    logger.warn({
      info: "Skipping message socket emit without companyId",
      messageId
    });
  }

  return res.send();
};

