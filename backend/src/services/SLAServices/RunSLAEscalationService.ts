import { Op } from "sequelize";
import { getIO } from "../../libs/socket";
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

  const io = getIO();

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

    io.to("pending").to("notification").emit("ticket", {
      action: "update",
      ticket
    });
  }
};

export default RunSLAEscalationService;
