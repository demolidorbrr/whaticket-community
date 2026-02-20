import AppError from "../../errors/AppError";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import formatBody from "../../helpers/Mustache";

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
}

interface ChannelMessageResponse {
  id: string;
  body: string;
  type: string;
  ack: number;
}

const makeMessageId = (channel: string): string =>
  `${channel}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const SendChannelMessageService = async ({
  body,
  ticket,
  quotedMsg
}: Request): Promise<ChannelMessageResponse> => {
  const webhookUrl = process.env.OMNICHANNEL_OUTBOUND_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new AppError("ERR_CHANNEL_WEBHOOK_NOT_CONFIGURED", 400);
  }

  const token = process.env.OMNICHANNEL_WEBHOOK_TOKEN;
  const timeoutMs = Number(process.env.OMNICHANNEL_WEBHOOK_TIMEOUT_MS || 15000);
  const fetchFn = (globalThis as any).fetch;

  if (typeof fetchFn !== "function") {
    throw new AppError("ERR_CHANNEL_TRANSPORT_NOT_AVAILABLE", 500);
  }

  const payload = {
    event: "channel.outbound.message",
    at: new Date().toISOString(),
    channel: ticket.channel,
    ticketId: ticket.id,
    queueId: ticket.queueId,
    contact: {
      id: ticket.contactId,
      name: ticket.contact?.name,
      number: ticket.contact?.number
    },
    message: {
      body: formatBody(body, ticket.contact),
      quotedMsgId: quotedMsg?.id
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      logger.warn(
        `Outbound omnichannel webhook returned ${response.status} for ticket ${ticket.id}`
      );
      throw new AppError("ERR_SENDING_CHANNEL_MSG", 502);
    }

    let data: any = {};
    try {
      data = await response.json();
    } catch (err) {
      data = {};
    }

    const responseBody = data.body || body;
    const sentMessage: ChannelMessageResponse = {
      id: data.id || data.messageId || makeMessageId(ticket.channel),
      body: responseBody,
      type: data.type || "chat",
      ack: data.ack !== undefined ? Number(data.ack) : 1
    };

    await ticket.update({ lastMessage: responseBody });

    return sentMessage;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    logger.error(
      err,
      `Error sending outbound channel message to ticket ${ticket.id}`
    );
    throw new AppError("ERR_SENDING_CHANNEL_MSG");
  } finally {
    clearTimeout(timeout);
  }
};

export default SendChannelMessageService;

