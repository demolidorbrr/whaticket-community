import { Router } from "express";
import * as ChannelController from "../controllers/ChannelController";

const channelRoutes = Router();

channelRoutes.post("/channels/inbound", ChannelController.inbound);

export default channelRoutes;

