import { getIO } from "../libs/socket";
import { getCompanyRoom } from "../libs/socketRooms";
import { logger } from "../utils/logger";

export const emitByCompany = (
  companyId: number | undefined,
  eventName: string,
  payload: Record<string, unknown>
): void => {
  const io = getIO();

  if (!companyId) {
    // Security hardening: never fallback to global broadcast in multi-tenant mode.
    logger.warn({
      info: "Skipping socket emit without company scope",
      eventName
    });
    return;
  }

  io.to(getCompanyRoom(companyId)).emit(eventName, payload);
};

