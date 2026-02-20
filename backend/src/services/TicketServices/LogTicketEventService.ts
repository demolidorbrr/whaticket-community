import TicketEvent from "../../models/TicketEvent";

interface Request {
  ticketId: number;
  queueId?: number;
  userId?: number;
  eventType: string;
  source?: string;
  payload?: unknown;
}

const LogTicketEventService = async ({
  ticketId,
  queueId,
  userId,
  eventType,
  source = "system",
  payload
}: Request): Promise<TicketEvent> => {
  const event = await TicketEvent.create({
    ticketId,
    queueId,
    userId,
    eventType,
    source,
    payload: payload ? JSON.stringify(payload) : null
  });

  return event;
};

export default LogTicketEventService;
