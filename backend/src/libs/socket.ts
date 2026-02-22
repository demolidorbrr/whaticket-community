import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";

let io: SocketIO;

interface TokenPayload {
  id: string;
  profile: string;
  companyId?: number | null;
  iat: number;
  exp: number;
}

export const SUPERADMIN_ROOM = "superadmin";

export const getCompanyRoom = (companyId: number): string =>
  `company:${companyId}`;

export const getCompanyTicketRoom = (
  companyId: number,
  ticketId: string | number
): string => `${getCompanyRoom(companyId)}:ticket:${ticketId}`;

export const getCompanyNotificationRoom = (companyId: number): string =>
  `${getCompanyRoom(companyId)}:notification`;

export const getCompanyTicketsStatusRoom = (
  companyId: number,
  status: string
): string => `${getCompanyRoom(companyId)}:tickets:${status}`;

const getCompanyId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getTokenFromHandshake = (token: unknown): string | null => {
  if (typeof token === "string" && token.trim()) {
    return token;
  }

  if (Array.isArray(token) && typeof token[0] === "string" && token[0].trim()) {
    return token[0];
  }

  return null;
};

const emitToRooms = (rooms: string[], event: string, payload: unknown): void => {
  if (!io || rooms.length === 0) {
    return;
  }

  let emitter: any = io;
  rooms.forEach(room => {
    emitter = emitter.to(room);
  });

  emitter.emit(event, payload);
};

export const emitToCompany = (
  companyId: number | null | undefined,
  event: string,
  payload: unknown
): void => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }

  if (companyId) {
    emitToRooms([getCompanyRoom(companyId)], event, payload);
  }

  io.to(SUPERADMIN_ROOM).emit(event, payload);
};

export const emitToCompanyRooms = (
  companyId: number | null | undefined,
  rooms: string[],
  event: string,
  payload: unknown
): void => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }

  if (companyId && rooms.length > 0) {
    emitToRooms(rooms, event, payload);
  }

  io.to(SUPERADMIN_ROOM).emit(event, payload);
};

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
    }
  });

  io.on("connection", socket => {
    const { token } = socket.handshake.query;
    let tokenData: TokenPayload | null = null;
    try {
      const parsedToken = getTokenFromHandshake(token);
      if (!parsedToken) {
        throw new AppError("ERR_SESSION_EXPIRED", 401);
      }

      tokenData = verify(parsedToken, authConfig.secret) as TokenPayload;
      logger.debug(JSON.stringify(tokenData), "io-onConnection: tokenData");
    } catch (error) {
      logger.error(JSON.stringify(error), "Error decoding token");
      socket.disconnect();
      return io;
    }

    const decodedToken = tokenData as TokenPayload;
    const companyId = getCompanyId(decodedToken.companyId);
    const isSuperadmin = decodedToken.profile === "superadmin";

    if (!isSuperadmin && !companyId) {
      logger.warn("Socket disconnected: missing tenant companyId");
      socket.disconnect();
      return io;
    }

    if (isSuperadmin) {
      socket.join(SUPERADMIN_ROOM);
    } else if (companyId) {
      socket.join(getCompanyRoom(companyId));
      (socket as any).tenantCompanyId = companyId;
    }

    (socket as any).tenantProfile = decodedToken.profile;

    logger.info("Client Connected");
    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");
      if (companyId) {
        socket.join(getCompanyTicketRoom(companyId, ticketId));
      }
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");
      if (companyId) {
        socket.join(getCompanyNotificationRoom(companyId));
      }
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);
      if (companyId) {
        socket.join(getCompanyTicketsStatusRoom(companyId, status));
      }
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected");
    });

    return socket;
  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};
