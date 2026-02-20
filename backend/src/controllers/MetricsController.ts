import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ListAIQueueMetricsService from "../services/MetricsServices/ListAIQueueMetricsService";

export const aiQueues = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { dateFrom, dateTo } = req.query as {
    dateFrom?: string;
    dateTo?: string;
  };

  const metrics = await ListAIQueueMetricsService({ dateFrom, dateTo });

  return res.status(200).json(metrics);
};
