import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ListAIQueueMetricsService from "../services/MetricsServices/ListAIQueueMetricsService";
import { isAdminProfile } from "../helpers/CheckUserProfile";

export const aiQueues = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (!isAdminProfile(req.user.profile)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { dateFrom, dateTo } = req.query as {
    dateFrom?: string;
    dateTo?: string;
  };

  const metrics = await ListAIQueueMetricsService({ dateFrom, dateTo });

  return res.status(200).json(metrics);
};

