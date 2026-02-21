import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import {
  getCompanyNotificationRoom,
  getCompanyStatusRoom,
  getCompanyTicketRoom
} from "../../libs/socketRooms";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import ShowTicketService from "./ShowTicketService";
import LogTicketEventService from "./LogTicketEventService";

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

  if (oldStatus === "closed") {
    await CheckContactOpenTickets(ticket.contact.id, ticket.whatsappId);
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

  const companyId = updatedTicket.companyId;
  if (!companyId) {
    // Security hardening: avoid emitting ticket updates without tenant scope.
    logger.warn({
      info: "Skipping ticket update socket emit without companyId",
      ticketId: updatedTicket.id
    });
    return { ticket: updatedTicket, oldStatus, oldUserId };
  }

  const io = getIO();
  const oldStatusRoomName = getCompanyStatusRoom(companyId, oldStatus);
  const updatedStatusRoomName = getCompanyStatusRoom(companyId, updatedTicket.status);
  const notificationRoomName = getCompanyNotificationRoom(companyId);
  const ticketRoomName = getCompanyTicketRoom(companyId, ticketId);

  if (
    updatedTicket.status !== oldStatus ||
    updatedTicket.user?.id !== oldUserId
  ) {
    io.to(oldStatusRoomName).emit("ticket", {
      action: "delete",
      ticketId: updatedTicket.id
    });
  }

  io.to(updatedStatusRoomName)
    .to(notificationRoomName)
    .to(ticketRoomName)
    .emit("ticket", {
      action: "update",
      ticket: updatedTicket
    });

  return { ticket: updatedTicket, oldStatus, oldUserId };
};

export default UpdateTicketService;

