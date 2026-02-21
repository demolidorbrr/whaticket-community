import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as PlanController from "../controllers/PlanController";

const planRoutes = Router();

planRoutes.get("/plans", isAuth, PlanController.index);
planRoutes.post("/plans", isAuth, PlanController.store);
planRoutes.put("/plans/:planId", isAuth, PlanController.update);
planRoutes.delete("/plans/:planId", isAuth, PlanController.remove);

export default planRoutes;

