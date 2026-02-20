import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as MetricsController from "../controllers/MetricsController";

const metricsRoutes = Router();

metricsRoutes.get("/metrics/ai/queues", isAuth, MetricsController.aiQueues);

export default metricsRoutes;
