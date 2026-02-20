import { Router } from "express";
import isAuth from "../middleware/isAuth";

import * as ScheduleController from "../controllers/ScheduleController";

const scheduleRoutes = Router();

scheduleRoutes.get("/schedules", isAuth, ScheduleController.index);
scheduleRoutes.get("/schedules/:scheduleId", isAuth, ScheduleController.show);
scheduleRoutes.post("/schedules", isAuth, ScheduleController.store);
scheduleRoutes.put("/schedules/:scheduleId", isAuth, ScheduleController.update);
scheduleRoutes.delete("/schedules/:scheduleId", isAuth, ScheduleController.remove);

export default scheduleRoutes;
