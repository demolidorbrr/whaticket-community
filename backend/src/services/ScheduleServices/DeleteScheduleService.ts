import Schedule from "../../models/Schedule";
import ShowScheduleService from "./ShowScheduleService";

const DeleteScheduleService = async (id: string | number): Promise<void> => {
  const schedule = await ShowScheduleService(id);
  await schedule.destroy();
};

export default DeleteScheduleService;
