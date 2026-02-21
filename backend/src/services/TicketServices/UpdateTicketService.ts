import { Op } from "sequelize";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead";
import { getIO } from "../../libs/socket";
import {
  getCompanyNotificationRoom,
  getCompanyStatusRoom,
  getCompanyTicketRoom
} from "../../libs/socketRooms";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import Tag from "../../models/Tag";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
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

  const ticketCompanyId = ticket.companyId;
  if (!ticketCompanyId) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 403);
  }

  if (queueId !== undefined && queueId !== null) {
    const queueExists = await Queue.count({
      where: { id: queueId, companyId: ticketCompanyId }
    });

    if (!queueExists) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  if (userId !== undefined && userId !== null) {
    const userExists = await User.count({
      where: { id: userId, companyId: ticketCompanyId }
    });

    if (!userExists) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  if (whatsappId !== undefined && whatsappId !== null) {
    const whatsappExists = await Whatsapp.count({
      where: { id: whatsappId, companyId: ticketCompanyId }
    });

    if (!whatsappExists) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  const rawTagIds = Array.isArray(tagIds) ? tagIds.map(Number) : [];
  if (
    Array.isArray(tagIds) &&
    rawTagIds.some(tagId => !Number.isInteger(tagId) || tagId <= 0)
  ) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const normalizedTagIds = [...new Set(rawTagIds)];

  if (normalizedTagIds.length > 0) {
    const validTagsCount = await Tag.count({
      where: {
        id: { [Op.in]: normalizedTagIds },
        companyId: ticketCompanyId
      }
    });

    if (validTagsCount !== normalizedTagIds.length) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

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
    await ticket.$set("tags", normalizedTagIds);
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

