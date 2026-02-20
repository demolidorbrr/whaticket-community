import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import ShowScheduleService from "./ShowScheduleService";

interface Request {
  scheduleId: string | number;
  body?: string;
  sendAt?: string | Date;
  status?: string;
}

const allowedStatus = ["pending", "canceled", "sent", "failed"];

const UpdateScheduleService = async ({
  scheduleId,
  body,
  sendAt,
  status
}: Request): Promise<Schedule> => {
  const schedule = await ShowScheduleService(scheduleId);

  if (body !== undefined && !body.trim()) {
    throw new AppError("ERR_SCHEDULE_EMPTY_BODY", 400);
  }

  if (status !== undefined && !allowedStatus.includes(status)) {
    throw new AppError("ERR_SCHEDULE_INVALID_STATUS", 400);
  }

  let parsedSendAt: Date | undefined;
  if (sendAt !== undefined) {
    parsedSendAt = new Date(sendAt);
    if (Number.isNaN(parsedSendAt.getTime())) {
      throw new AppError("ERR_SCHEDULE_INVALID_DATE", 400);
    }
  }

  await schedule.update({
    ...(body !== undefined ? { body: body.trim() } : {}),
    ...(parsedSendAt ? { sendAt: parsedSendAt } : {}),
    ...(status !== undefined ? { status } : {})
  });

  return ShowScheduleService(scheduleId);
};

export default UpdateScheduleService;
