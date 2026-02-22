import { Op } from "sequelize";

import Schedule from "../../models/Schedule";
import { emitToCompany } from "../../libs/socket";
import ShowTicketService from "../TicketServices/ShowTicketService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendChannelMessageService from "../ChannelServices/SendChannelMessageService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";

let isRunning = false;

const RunScheduledMessagesService = async (): Promise<void> => {
  if (isRunning) return;
  isRunning = true;

  try {
    const schedules = await Schedule.findAll({
      where: {
        status: "pending",
        sendAt: {
          [Op.lte]: new Date()
        }
      },
      order: [["sendAt", "ASC"]],
      limit: 20
    });

    for (const schedule of schedules) {
      try {
        const ticket = await ShowTicketService(schedule.ticketId);
        const isWhatsAppChannel = !ticket.channel || ticket.channel === "whatsapp";

        const sentMessage = isWhatsAppChannel
          ? await SendWhatsAppMessage({ body: schedule.body, ticket })
          : await SendChannelMessageService({ body: schedule.body, ticket });

        await CreateMessageService({
          messageData: {
            id: sentMessage.id,
            ticketId: ticket.id,
            contactId: ticket.contactId,
            body: sentMessage.body || schedule.body,
            fromMe: true,
            read: true,
            mediaType: (sentMessage as any).type || "chat",
            ack: sentMessage.ack !== undefined ? sentMessage.ack : 1
          }
        });

        await schedule.update({
          status: "sent",
          sentAt: new Date(),
          errorMessage: null
        });
        emitToCompany((schedule as any).companyId ?? (ticket as any).companyId, "schedule", {
          action: "update",
          schedule
        });
      } catch (err) {
        logger.error(
          err,
          `Error processing schedule ${schedule.id} for ticket ${schedule.ticketId}`
        );

        await schedule.update({
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "UNKNOWN_ERROR"
        });
        emitToCompany((schedule as any).companyId ?? null, "schedule", {
          action: "update",
          schedule
        });
      }
    }
  } finally {
    isRunning = false;
  }
};

export default RunScheduledMessagesService;
