import makeWASocket, {
  UserFacingSocketConfig,
  DisconnectReason,
  WASocket,
  AuthenticationCreds,
  initAuthCreds,
  isJidUser,
  isLidUser,
  isJidGroup,
  makeCacheableSignalKeyStore,
  BufferJSON
} from "whaileys";
import { Boom } from "@hapi/boom";
import { HttpsProxyAgent } from "https-proxy-agent";
import NodeCache from "node-cache";

import Whatsapp from "../../../models/Whatsapp";
import { getIO } from "../../../libs/socket";
import { logger } from "../../../utils/logger";
import { setInRedis, getFromRedis } from "../../../libs/redisStore";
import {
  SendMessageOptions,
  ProviderMessage,
  ProviderMediaInput,
  SendMediaOptions,
  ProviderContact
} from "../types";
import { WhatsappProvider } from "../whatsappProvider";
import { sleep } from "../../../utils/sleep";

interface Session extends WASocket {
  id: number;
}

const sessions = new Map<number, Session>();

const assertUnique = (sessionId: number) => {
  const wbot = sessions.get(sessionId);

  if (wbot) {
    wbot.ev.removeAllListeners("connection.update");
    sessions.delete(sessionId);

    wbot.end(undefined);
  }
};

const saveSessionCreds = async (
  whatsapp: Whatsapp,
  creds: AuthenticationCreds
) => {
  try {
    await whatsapp.update({
      session: JSON.stringify(creds, BufferJSON.replacer),
      status: "CONNECTED",
      qrcode: ""
    });

    logger.debug({
      info: "Creds saved to database",
      whatsappId: whatsapp.id
    });
  } catch (err) {
    logger.error({
      info: "Error saving creds to database",
      whatsappId: whatsapp.id,
      err
    });
  }
};

const useSessionAuthState = async (whatsapp: Whatsapp) => {
  const sessionId = whatsapp.id;

  const creds = whatsapp.session
    ? JSON.parse(whatsapp.session, BufferJSON.reviver)
    : initAuthCreds();

  return {
    state: {
      creds: creds as AuthenticationCreds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: any = {};
          const deviceId = creds?.me?.id || "unknown";

          try {
            await Promise.all(
              ids.map(async id => {
                const key = `wpp:${sessionId}:${deviceId}:${type}:${id}`;
                const stored = await getFromRedis(key);

                if (stored) {
                  data[id] = JSON.parse(stored, BufferJSON.reviver);
                }
              })
            );
          } catch (err) {
            logger.error({
              info: "Error getting keys from Redis",
              sessionId,
              type,
              err
            });
          }

          return data;
        },
        set: async (data: any) => {
          const deviceId = creds?.me?.id || "unknown";

          try {
            const promises: Promise<void>[] = [];

            Object.entries(data).forEach(([category, categoryData]) => {
              Object.entries(categoryData as any).forEach(([id, value]) => {
                const key = `wpp:${sessionId}:${deviceId}:${category}:${id}`;
                const valueJson = JSON.stringify(value, BufferJSON.replacer);
                promises.push(setInRedis(key, valueJson));
              });
            });

            await Promise.all(promises);
          } catch (err) {
            logger.error({
              info: "Error setting keys to Redis",
              sessionId,
              err
            });
          }
        }
      }
    },
    saveCreds: () => saveSessionCreds(whatsapp, creds)
  };
};

const removeSession = async (whatsappId: number): Promise<void> => {
  sessions.delete(whatsappId); // todo check
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const sessionId = whatsapp.id;
  const io = getIO();

  const { state, saveCreds } = await useSessionAuthState(whatsapp);

  const connOptions: UserFacingSocketConfig = {
    printQRInTerminal: false,
    browser: ["Windows", "Chrome", "Chrome 114.0.5735.198"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        logger as any,
        new NodeCache({
          useClones: false,
          stdTTL: 60 * 60,
          checkperiod: 60 * 5
        })
      )
    },
    shouldSyncHistoryMessage: () => false,
    shouldIgnoreJid: jid => {
      const botRegexp = /^1313555\d{4}$|^131655500\d{2}$/;
      if (botRegexp.test(jid?.split?.("@")?.[0])) return true;

      return !isJidUser(jid) && !isLidUser(jid) && !isJidGroup(jid);
    },
    syncFullHistory: false,
    version: [2, 3000, 1029659368],
    emitOwnEvents: false
  };

  const proxyAddress = process.env.PROXY_ADDRESS || "";
  if (proxyAddress) {
    const proxyAuth = process.env.PROXY_AUTH || "";
    const proxyUrl = proxyAuth
      ? `http://${proxyAuth}@${proxyAddress}`
      : `http://${proxyAddress}`;

    connOptions.agent = new HttpsProxyAgent(proxyUrl);
    connOptions.fetchAgent = new HttpsProxyAgent(proxyUrl);
  }

  assertUnique(sessionId);

  const wbot = makeWASocket(connOptions) as Session;

  sessions.set(sessionId, wbot);

  wbot.ev.on("creds.update", () => {
    console.log("creds!!!!!!"); // todo verificar se realmente deveria triggar isso sempre que recebe uma msg, colocar um debounce

    saveCreds();
  });

  wbot.ev.on("connection.update", async update => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        await whatsapp.update({
          status: "DISCONNECTED",
          qrcode: "",
          retries: 0
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        await removeSession(sessionId);
      } else {
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          await whatsapp.update({ status: "DISCONNECTED" });
          io.emit("whatsappSession", {
            action: "update",
            session: whatsapp
          });
          logger.info({
            info: "Connection closed, reconnecting...",
            sessionId,
            statusCode
          });

          await sleep(3000);
          init(whatsapp);
        }
      }
    }

    if (connection === "open") {
      await whatsapp.update({
        status: "CONNECTED",
        qrcode: "",
        retries: 0
      });

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });

      logger.info({ info: "Session connected", sessionId });
    }

    if (qr !== undefined) {
      await whatsapp.update({
        qrcode: qr,
        status: "qrcode"
      });

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });

      logger.info({ info: "QR Code generated", sessionId });
    }
  });
};

const logout = async (sessionId: number): Promise<void> => {
  const wbot = sessions.get(sessionId);

  if (wbot) {
    try {
      await wbot.logout();
    } catch (err) {
      logger.error({ info: "Error on logout", sessionId, err });
    }
  }

  await removeSession(sessionId);
};

const sendMessage = async (
  _sessionId: number,
  _to: string,
  _body: string,
  _options?: SendMessageOptions
): Promise<ProviderMessage> => {
  throw new Error("Not implemented");
};

const sendMedia = async (
  _sessionId: number,
  _to: string,
  _media: ProviderMediaInput,
  _options?: SendMediaOptions
): Promise<ProviderMessage> => {
  throw new Error("Not implemented");
};

const deleteMessage = async (
  _sessionId: number,
  _chatId: string,
  _messageId: string,
  _fromMe: boolean
): Promise<void> => {
  throw new Error("Not implemented");
};

const checkNumber = async (
  _sessionId: number,
  _number: string
): Promise<string> => {
  throw new Error("Not implemented");
};

const getProfilePicUrl = async (
  _sessionId: number,
  _number: string
): Promise<string> => {
  throw new Error("Not implemented");
};

const getContacts = async (_sessionId: number): Promise<ProviderContact[]> => {
  throw new Error("Not implemented");
};

const sendSeen = async (_sessionId: number, _chatId: string): Promise<void> => {
  throw new Error("Not implemented");
};

const fetchChatMessages = async (
  _sessionId: number,
  _chatId: string,
  _limit = 100
): Promise<ProviderMessage[]> => {
  throw new Error("Not implemented");
};

export const WhaileysProvider: WhatsappProvider = {
  init,
  removeSession,
  logout,
  sendMessage,
  sendMedia,
  deleteMessage,
  checkNumber,
  getProfilePicUrl,
  getContacts,
  sendSeen,
  fetchChatMessages
};
