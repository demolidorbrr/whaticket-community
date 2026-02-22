import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import {
  emitToCompanyRooms,
  getCompanyNotificationRoom,
  getCompanyTicketRoom,
  getCompanyTicketsStatusRoom
} from "../../libs/socket";
import Ticket from "../../models/Ticket";
import ShowTicketService from "./ShowTicketService";
import LogTicketEventService from "./LogTicketEventService";
import AppError from "../../errors/AppError";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";

interface TicketData {
  status?: string;
  userId?: number;
  queueId?: number;
  whatsappId?: number;
  leadScore?: number;
  tagIds?: number[];
}

interface Request {
  ticketData: TicketData;
  ticketId: string | number;
  source?: string;
}

interface Response {
  ticket: Ticket;
  oldStatus: string;
  oldUserId: number | undefined;
}

const UpdateTicketService = async ({
  ticketData,
  ticketId,
  source = "manual"
}: Request): Promise<Response> => {
  const { status, userId, queueId, whatsappId, leadScore, tagIds } = ticketData;

  const ticket = await ShowTicketService(ticketId);
  await SetTicketMessagesAsRead(ticket);

  if (whatsappId && ticket.whatsappId !== whatsappId) {
    await CheckContactOpenTickets(ticket.contactId, whatsappId);
  }

  const oldStatus = ticket.status;
  const oldUserId = ticket.user?.id;
  const oldQueueId = ticket.queueId;
  const companyId = (ticket as any).companyId as number;

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id, ticket.whatsappId);
  }

  if (whatsappId) {
    const targetWhatsapp = await Whatsapp.findByPk(whatsappId, {
      attributes: ["id", "companyId"]
    });

    if (!targetWhatsapp || (targetWhatsapp as any).companyId !== companyId) {
      throw new AppError("ERR_NO_WAPP_FOUND", 404);
    }
  }

  if (queueId !== undefined && queueId !== null) {
    const targetQueue = await Queue.findByPk(queueId, {
      attributes: ["id", "companyId"]
    });

    if (!targetQueue || (targetQueue as any).companyId !== companyId) {
      throw new AppError("ERR_NO_QUEUE_FOUND", 404);
    }
  }

  if (userId !== undefined && userId !== null) {
    const targetUser = await User.findByPk(userId, {
      attributes: ["id", "companyId"]
    });

    if (!targetUser || (targetUser as any).companyId !== companyId) {
      throw new AppError("ERR_NO_USER_FOUND", 404);
    }
  }

  if (Array.isArray(tagIds)) {
    if (tagIds.length > 0) {
      const tags = await Tag.findAll({
        where: { id: tagIds },
        attributes: ["id", "companyId"]
      });

      const hasCrossTenantTag = tags.some(
        tag => (tag as any).companyId !== companyId
      );

      if (tags.length !== tagIds.length || hasCrossTenantTag) {
        throw new AppError("ERR_NO_TAG_FOUND", 404);
      }
    }
  }

  await ticket.update({
    status,
    queueId,
    userId,
    leadScore
  });

  if (whatsappId) {
    await ticket.update({
      whatsappId
    });
  }

  if (Array.isArray(tagIds)) {
    await ticket.$set("tags", tagIds);
  }

  if (status === "closed" && !ticket.resolvedAt) {
    await ticket.update({ resolvedAt: new Date() });
  }

  // Reload the ticket with all relations so socket consumers receive
  // an up-to-date payload (user/queue/contact/tags/etc).
  const updatedTicket = await ShowTicketService(ticketId);

  if (status && oldStatus !== updatedTicket.status) {
    await LogTicketEventService({
      ticketId: updatedTicket.id,
      queueId: updatedTicket.queueId || oldQueueId,
      userId: updatedTicket.userId || oldUserId,
      eventType: "ticket_status_changed",
      source,
      payload: { oldStatus, newStatus: updatedTicket.status }
    });
  }

  if (queueId !== undefined && oldQueueId !== updatedTicket.queueId) {
    await LogTicketEventService({
      ticketId: updatedTicket.id,
      queueId: updatedTicket.queueId,
      userId: updatedTicket.userId,
      eventType: "ticket_queue_changed",
      source,
      payload: { oldQueueId, newQueueId: updatedTicket.queueId }
    });
  }

  if (userId !== undefined && oldUserId !== updatedTicket.userId) {
    await LogTicketEventService({
      ticketId: updatedTicket.id,
      queueId: updatedTicket.queueId,
      userId: updatedTicket.userId,
      eventType: "ticket_user_changed",
      source,
      payload: { oldUserId, newUserId: updatedTicket.userId }
    });
  }

  if (
    updatedTicket.status !== oldStatus ||
    updatedTicket.user?.id !== oldUserId
  ) {
    emitToCompanyRooms(
      companyId,
      [getCompanyTicketsStatusRoom(companyId, oldStatus)],
      "ticket",
      {
        action: "delete",
        ticketId: updatedTicket.id
      }
    );
  }

  emitToCompanyRooms(
    companyId,
    [
      getCompanyTicketsStatusRoom(companyId, updatedTicket.status),
      getCompanyNotificationRoom(companyId),
      getCompanyTicketRoom(companyId, ticketId.toString())
    ],
    "ticket",
    {
      action: "update",
      ticket: updatedTicket
    }
  );

  return { ticket: updatedTicket, oldStatus, oldUserId };
};

export default UpdateTicketService;
