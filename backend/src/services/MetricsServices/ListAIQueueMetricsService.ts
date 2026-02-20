import { Op } from "sequelize";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketEvent from "../../models/TicketEvent";

interface Request {
  dateFrom?: string;
  dateTo?: string;
}

interface QueueMetric {
  queueId: number;
  queueName: string;
  resolvedCount: number;
  transferCount: number;
  aiReplyCount: number;
  avgTimeToHumanMinutes: number;
}

const parseRange = (dateFrom?: string, dateTo?: string) => {
  if (!dateFrom && !dateTo) {
    return undefined;
  }

  const start = dateFrom ? new Date(dateFrom) : new Date("2000-01-01");
  const end = dateTo ? new Date(dateTo) : new Date();

  return { [Op.between]: [start, end] };
};

const ListAIQueueMetricsService = async ({
  dateFrom,
  dateTo
}: Request): Promise<QueueMetric[]> => {
  const createdAtRange = parseRange(dateFrom, dateTo);

  const queues = await Queue.findAll({
    where: { aiEnabled: true },
    attributes: ["id", "name"]
  });

  const metrics = await Promise.all(
    queues.map(async queue => {
      const ticketWhere: any = { queueId: queue.id };

      if (createdAtRange) {
        ticketWhere.createdAt = createdAtRange;
      }

      const [resolvedCount, transferCount, aiReplyCount, respondedTickets] =
        await Promise.all([
          Ticket.count({
            where: {
              ...ticketWhere,
              status: "closed"
            }
          }),
          TicketEvent.count({
            where: {
              queueId: queue.id,
              eventType: { [Op.in]: ["ai_transfer"] },
              ...(createdAtRange ? { createdAt: createdAtRange } : {})
            }
          }),
          TicketEvent.count({
            where: {
              queueId: queue.id,
              eventType: "ai_reply",
              ...(createdAtRange ? { createdAt: createdAtRange } : {})
            }
          }),
          Ticket.findAll({
            where: {
              ...ticketWhere,
              firstHumanResponseAt: { [Op.ne]: null }
            },
            attributes: ["id", "createdAt", "firstHumanResponseAt"]
          })
        ]);

      let avgTimeToHumanMinutes = 0;

      if (respondedTickets.length > 0) {
        const totalMinutes = respondedTickets.reduce((sum, ticket) => {
          const startedAt = new Date(ticket.createdAt).getTime();
          const firstHumanAt = new Date(ticket.firstHumanResponseAt).getTime();
          if (!startedAt || !firstHumanAt || firstHumanAt <= startedAt) {
            return sum;
          }
          return sum + (firstHumanAt - startedAt) / (1000 * 60);
        }, 0);

        avgTimeToHumanMinutes = Number(
          (totalMinutes / respondedTickets.length).toFixed(2)
        );
      }

      return {
        queueId: queue.id,
        queueName: queue.name,
        resolvedCount,
        transferCount,
        aiReplyCount,
        avgTimeToHumanMinutes
      };
    })
  );

  return metrics;
};

export default ListAIQueueMetricsService;
