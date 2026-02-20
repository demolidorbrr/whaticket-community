import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import ShowTicketService from "../TicketServices/ShowTicketService";

interface Request {
  ticketId: number;
  userId: number;
  body: string;
  sendAt: string | Date;
}

const CreateScheduleService = async ({
  ticketId,
  userId,
  body,
  sendAt
}: Request): Promise<Schedule> => {
  const normalizedBody = body?.trim();
  if (!normalizedBody) {
    throw new AppError("ERR_SCHEDULE_EMPTY_BODY", 400);
  }

  const parsedSendAt = new Date(sendAt);
  if (Number.isNaN(parsedSendAt.getTime())) {
    throw new AppError("ERR_SCHEDULE_INVALID_DATE", 400);
  }

  const ticket = await ShowTicketService(ticketId);

  const schedule = await Schedule.create({
    ticketId: ticket.id,
    contactId: ticket.contactId,
    userId,
    body: normalizedBody,
    sendAt: parsedSendAt,
    status: "pending"
  });

  return schedule;
};

export default CreateScheduleService;
