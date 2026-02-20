import Ticket from "../../models/Ticket";
import GetSettingValueService from "../SettingServices/GetSettingValueService";
import LogTicketEventService from "../TicketServices/LogTicketEventService";

const StartTicketSLAService = async (
  ticket: Ticket,
  source = "system"
): Promise<void> => {
  if (ticket.isGroup || ticket.status === "closed") {
    return;
  }

  const slaEnabled =
    (await GetSettingValueService("slaEscalationEnabled", "disabled")) ===
    "enabled";

  if (!slaEnabled) {
    return;
  }

  const replyMinutes = Number(
    await GetSettingValueService("slaReplyMinutes", "30")
  );

  if (replyMinutes <= 0) {
    return;
  }

  const dueAt = new Date(Date.now() + replyMinutes * 60 * 1000);
  await ticket.update({ slaDueAt: dueAt });

  await LogTicketEventService({
    ticketId: ticket.id,
    queueId: ticket.queueId,
    userId: ticket.userId,
    eventType: "sla_started",
    source,
    payload: { dueAt: dueAt.toISOString() }
  });
};

export default StartTicketSLAService;

