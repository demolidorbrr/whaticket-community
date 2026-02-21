import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
import {
  getCompanyNotificationRoom,
  getCompanyStatusRoom
} from "../../libs/socketRooms";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import GetSettingValueService from "../SettingServices/GetSettingValueService";
import LogTicketEventService from "../TicketServices/LogTicketEventService";

const RunSLAEscalationService = async (): Promise<void> => {
  const enabled =
    (await GetSettingValueService("slaEscalationEnabled", "disabled")) ===
    "enabled";

  if (!enabled) {
    return;
  }

  const escalationQueueIdRaw = await GetSettingValueService(
    "slaEscalationQueueId",
    ""
  );
  const escalationQueueId = escalationQueueIdRaw
    ? Number(escalationQueueIdRaw)
    : undefined;

  const replyMinutes = Number(
    await GetSettingValueService("slaReplyMinutes", "30")
  );

  const overdueTickets = await Ticket.findAll({
    where: {
      status: { [Op.in]: ["pending", "open"] },
      slaDueAt: { [Op.lt]: new Date() }
    }
  });

  const io = getIO();
  const escalationQueueByCompany = new Map<number, number | null>();

  for (const ticket of overdueTickets) {
    const previousStatus = ticket.status;

    const nextDueAt =
      replyMinutes > 0
        ? new Date(Date.now() + replyMinutes * 60 * 1000)
        : ticket.slaDueAt;

    let nextQueueId = ticket.queueId;
    if (escalationQueueId && escalationQueueId > 0 && ticket.companyId) {
      let resolvedEscalationQueueId = escalationQueueByCompany.get(
        ticket.companyId
      );

      if (resolvedEscalationQueueId === undefined) {
        const queueExists = await Queue.count({
          where: {
            id: escalationQueueId,
            companyId: ticket.companyId
          }
        });

        resolvedEscalationQueueId = queueExists ? escalationQueueId : null;
        escalationQueueByCompany.set(ticket.companyId, resolvedEscalationQueueId);
      }

      if (resolvedEscalationQueueId) {
        nextQueueId = resolvedEscalationQueueId;
      }
    }

    await ticket.update({
      status: "pending",
      userId: null,
      queueId: nextQueueId,
      slaDueAt: nextDueAt
    });

    await LogTicketEventService({
      ticketId: ticket.id,
      queueId: nextQueueId,
      userId: undefined,
      eventType: "sla_escalated",
      source: "sla",
      payload: {
        previousStatus,
        escalationQueueId: nextQueueId
      }
    });

    if (!ticket.companyId) {
      // Security hardening: avoid SLA socket emits without tenant scope.
      logger.warn({
        info: "Skipping SLA ticket emit without companyId",
        ticketId: ticket.id
      });
      continue;
    }

    const statusRoomName = getCompanyStatusRoom(ticket.companyId, "pending");
    const notificationRoomName = getCompanyNotificationRoom(ticket.companyId);

    io.to(statusRoomName).to(notificationRoomName).emit("ticket", {
      action: "update",
      ticket
    });
  }
};

export default RunSLAEscalationService;

