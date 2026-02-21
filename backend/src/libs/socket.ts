import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";
import {
  getCompanyNotificationRoom,
  getCompanyRoom,
  getCompanyStatusRoom,
  getCompanyTicketRoom
} from "./socketRooms";

interface SocketTokenPayload {
  id: string;
  profile: string;
  companyId?: number;
}

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
    }
  });

  io.on("connection", socket => {
    const { token } = socket.handshake.query;
    let tokenData: SocketTokenPayload;

    try {
      tokenData = verify(String(token || ""), authConfig.secret) as SocketTokenPayload;
      logger.debug(JSON.stringify(tokenData), "io-onConnection: tokenData");
    } catch (error) {
      logger.error(JSON.stringify(error), "Error decoding token");
      socket.disconnect();
      return io;
    }

    const companyId = Number(tokenData.companyId || 0);

    if (companyId > 0) {
      socket.join(getCompanyRoom(companyId));
    }

    logger.info("Client Connected");

    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");

      const roomName =
        companyId > 0 ? getCompanyTicketRoom(companyId, ticketId) : ticketId;

      socket.join(roomName);
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");

      const roomName =
        companyId > 0 ? getCompanyNotificationRoom(companyId) : "notification";

      socket.join(roomName);
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);

      const roomName =
        companyId > 0 ? getCompanyStatusRoom(companyId, status) : status;

      socket.join(roomName);
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

