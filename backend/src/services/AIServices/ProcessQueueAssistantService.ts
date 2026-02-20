import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import Tag from "../../models/Tag";
import { logger } from "../../utils/logger";
import type {
  ContactPayload,
  MessagePayload
} from "../../handlers/handleWhatsappEvents";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import CreateMessageService from "../MessageServices/CreateMessageService";
import LogTicketEventService from "../TicketServices/LogTicketEventService";

interface Request {
  ticket: Ticket;
  messagePayload: MessagePayload;
  contactPayload: ContactPayload;
  whatsappId: number;
}

interface AssistantResponse {
  reply?: string;
  transferQueueId?: number;
  assignUserId?: number;
  ticketStatus?: string;
  closeTicket?: boolean;
  leadScore?: number;
  leadScoreDelta?: number;
  tags?: string[];
}

const parseNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

const parseInteger = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return Math.round(parsed);
};

const parseAssistantResponse = (payload: unknown): AssistantResponse => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const data = payload as Record<string, unknown>;

  return {
    reply: typeof data.reply === "string" ? data.reply.trim() : undefined,
    transferQueueId: parseNumber(data.transferQueueId || data.queueId),
    assignUserId: parseNumber(data.assignUserId || data.userId),
    ticketStatus:
      typeof data.ticketStatus === "string" ? data.ticketStatus : undefined,
    closeTicket: Boolean(data.closeTicket),
    leadScore: parseInteger(data.leadScore),
    leadScoreDelta: Number(data.leadScoreDelta || 0),
    tags: Array.isArray(data.tags)
      ? (data.tags as unknown[])
          .filter(item => typeof item === "string")
          .map(item => String(item).trim())
          .filter(Boolean)
      : undefined
  };
};

const ensureTags = async (tags?: string[]): Promise<number[] | undefined> => {
  if (!tags || tags.length === 0) return undefined;

  const ids: number[] = [];

  for (const tagName of tags) {
    const name = tagName.trim();
    if (!name) continue;

    let tag = await Tag.findOne({ where: { name } });
    if (!tag) {
      tag = await Tag.create({ name, color: "#546e7a" });
    }

    ids.push(tag.id);
  }

  return ids.length ? ids : undefined;
};

const callAssistantWebhook = async (
  url: string,
  payload: unknown,
  timeoutMs: number,
  token?: string
): Promise<{ ok: boolean; status: number; data?: unknown }> => {
  const fetchFn = (globalThis as any).fetch;

  if (typeof fetchFn !== "function") {
    throw new Error("Global fetch is not available in this runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch (err) {
      data = undefined;
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timeout);
  }
};

const ProcessQueueAssistantService = async ({
  ticket,
  messagePayload,
  contactPayload,
  whatsappId
}: Request): Promise<void> => {
  try {
    if (messagePayload.fromMe || ticket.isGroup || ticket.userId) {
      return;
    }

    if (!ticket.queueId) {
      return;
    }

    const queue = await Queue.findByPk(ticket.queueId);
    if (!queue || !queue.aiEnabled) {
      return;
    }

    const webhookUrl = queue.aiWebhookUrl || process.env.AI_N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      return;
    }

    const timeoutMs = Number(process.env.AI_N8N_WEBHOOK_TIMEOUT_MS || 15000);
    const token = process.env.AI_N8N_WEBHOOK_TOKEN;

    const recentMessages = await Message.findAll({
      where: { ticketId: ticket.id },
      attributes: ["id", "body", "fromMe", "mediaType", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 20
    });

    const webhookPayload = {
      event: "queue.assistant.incoming_message",
      at: new Date().toISOString(),
      whatsappId,
      queue: {
        id: queue.id,
        name: queue.name,
        aiMode: queue.aiMode,
        aiPrompt: queue.aiPrompt,
        aiAutoReply: queue.aiAutoReply
      },
      ticket: {
        id: ticket.id,
        status: ticket.status,
        queueId: ticket.queueId,
        userId: ticket.userId
      },
      contact: {
        id: ticket.contactId,
        name: contactPayload.name,
        number: contactPayload.number,
        lid: contactPayload.lid
      },
      message: messagePayload,
      recentMessages: recentMessages.reverse().map(item => ({
        id: item.id,
        body: item.body,
        fromMe: item.fromMe,
        mediaType: item.mediaType,
        createdAt: item.createdAt
      }))
    };

    const response = await callAssistantWebhook(
      webhookUrl,
      webhookPayload,
      timeoutMs,
      token
    );

    if (!response.ok) {
      logger.warn(
        `Queue assistant webhook returned status ${response.status} for queue ${queue.id}`
      );
      return;
    }

    const assistantResponse = parseAssistantResponse(response.data);
    const tagIds = await ensureTags(assistantResponse.tags);
    const computedLeadScore =
      assistantResponse.leadScore !== undefined
        ? assistantResponse.leadScore
        : ticket.leadScore + Number(assistantResponse.leadScoreDelta || 0);
    const nextLeadScore = Math.max(0, computedLeadScore);

    await LogTicketEventService({
      ticketId: ticket.id,
      queueId: ticket.queueId,
      userId: ticket.userId,
      eventType: "ai_decision",
      source: "ai_supervisor",
      payload: assistantResponse
    });

    const nextStatus =
      assistantResponse.ticketStatus ||
      (assistantResponse.closeTicket ? "closed" : undefined);

    if (
      assistantResponse.transferQueueId ||
      assistantResponse.assignUserId ||
      nextStatus
    ) {
      await UpdateTicketService({
        ticketId: ticket.id,
        ticketData: {
          queueId: assistantResponse.transferQueueId,
          userId: assistantResponse.assignUserId,
          status: nextStatus,
          leadScore: nextLeadScore,
          tagIds
        },
        source: "ai_supervisor"
      });

      if (assistantResponse.transferQueueId) {
        await LogTicketEventService({
          ticketId: ticket.id,
          queueId: assistantResponse.transferQueueId,
          userId: assistantResponse.assignUserId,
          eventType: "ai_transfer",
          source: "ai_supervisor",
          payload: {
            fromQueueId: ticket.queueId,
            toQueueId: assistantResponse.transferQueueId
          }
        });
      }
    } else if (tagIds || nextLeadScore !== ticket.leadScore) {
      await UpdateTicketService({
        ticketId: ticket.id,
        ticketData: {
          leadScore: nextLeadScore,
          tagIds
        },
        source: "ai_supervisor"
      });
    }

    const canReply =
      queue.aiMode !== "triage" || Boolean(queue.aiAutoReply);

    if (assistantResponse.reply && canReply) {
      const sentMessage = await SendWhatsAppMessage({
        body: assistantResponse.reply,
        ticket
      });

      await CreateMessageService({
        messageData: {
          id: sentMessage.id,
          ticketId: ticket.id,
          contactId: ticket.contactId,
          body: sentMessage.body || assistantResponse.reply,
          fromMe: true,
          read: true,
          mediaType: sentMessage.type,
          ack: sentMessage.ack !== undefined ? sentMessage.ack : 0
        }
      });

      await LogTicketEventService({
        ticketId: ticket.id,
        queueId: ticket.queueId,
        userId: ticket.userId,
        eventType: "ai_reply",
        source: "ai_supervisor",
        payload: { replySize: assistantResponse.reply.length }
      });
    }
  } catch (err) {
    logger.error(err, "Error processing queue assistant automation");
  }
};

export default ProcessQueueAssistantService;
