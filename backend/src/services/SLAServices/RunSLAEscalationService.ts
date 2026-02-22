import { Op } from "sequelize";
import {
  emitToCompanyRooms,
  getCompanyNotificationRoom,
  getCompanyTicketsStatusRoom
} from "../../libs/socket";
import Ticket from "../../models/Ticket";
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

  for (const ticket of overdueTickets) {
    const previousStatus = ticket.status;

    const nextDueAt =
      replyMinutes > 0
        ? new Date(Date.now() + replyMinutes * 60 * 1000)
        : ticket.slaDueAt;

    const nextQueueId =
      escalationQueueId && escalationQueueId > 0
        ? escalationQueueId
        : ticket.queueId;

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

    const companyId = (ticket as any).companyId as number;

    emitToCompanyRooms(
      companyId,
      [
        getCompanyTicketsStatusRoom(companyId, "pending"),
        getCompanyNotificationRoom(companyId)
      ],
      "ticket",
      {
        action: "update",
        ticket
      }
    );
  }
};

export default RunSLAEscalationService;
