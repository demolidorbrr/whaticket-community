import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListSchedulesService from "../services/ScheduleServices/ListSchedulesService";
import CreateScheduleService from "../services/ScheduleServices/CreateScheduleService";
import UpdateScheduleService from "../services/ScheduleServices/UpdateScheduleService";
import DeleteScheduleService from "../services/ScheduleServices/DeleteScheduleService";
import ShowScheduleService from "../services/ScheduleServices/ShowScheduleService";

type IndexQuery = {
  status?: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { status } = req.query as IndexQuery;
  const schedules = await ListSchedulesService({ status });

  return res.status(200).json(schedules);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { scheduleId } = req.params;
  const schedule = await ShowScheduleService(scheduleId);

  return res.status(200).json(schedule);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId, body, sendAt } = req.body;
  const userId = Number(req.user.id);

  const createdSchedule = await CreateScheduleService({
    ticketId: Number(ticketId),
    body,
    sendAt,
    userId
  });
  const schedule = await ShowScheduleService(createdSchedule.id);

  const io = getIO();
  io.emit("schedule", {
    action: "create",
    schedule
  });

  return res.status(200).json(schedule);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { scheduleId } = req.params;
  const { body, sendAt, status } = req.body;

  const schedule = await UpdateScheduleService({
    scheduleId,
    body,
    sendAt,
    status
  });

  const io = getIO();
  io.emit("schedule", {
    action: "update",
    schedule
  });

  return res.status(200).json(schedule);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { scheduleId } = req.params;
  await DeleteScheduleService(scheduleId);

  const io = getIO();
  io.emit("schedule", {
    action: "delete",
    scheduleId: Number(scheduleId)
  });

  return res.status(200).json({ message: "Schedule deleted" });
};
