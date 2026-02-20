import { getIO } from "../libs/socket";
import { getCompanyRoom } from "../libs/socketRooms";

export const emitByCompany = (
  companyId: number | undefined,
  eventName: string,
  payload: Record<string, unknown>
): void => {
  const io = getIO();

  if (companyId) {
    io.to(getCompanyRoom(companyId)).emit(eventName, payload);
    return;
  }

  io.emit(eventName, payload);
};

