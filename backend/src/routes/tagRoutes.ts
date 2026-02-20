import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as TagController from "../controllers/TagController";

const tagRoutes = Router();

tagRoutes.get("/tags", isAuth, TagController.index);
tagRoutes.post("/tags", isAuth, TagController.store);
tagRoutes.put("/tags/:tagId", isAuth, TagController.update);
tagRoutes.delete("/tags/:tagId", isAuth, TagController.remove);

export default tagRoutes;
