import { readFileSync } from "fs";

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
  BufferJSON,
  WAMessage,
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
  jidDecode
} from "whaileys";
import { Boom } from "@hapi/boom";
import { HttpsProxyAgent } from "https-proxy-agent";
import NodeCache from "node-cache";

import Whatsapp from "../../../models/Whatsapp";
import { getIO } from "../../../libs/socket";
import { logger } from "../../../utils/logger";
import { setInRedis, getFromRedis } from "../../../libs/redisStore";
import AppError from "../../../errors/AppError";
import {
  SendMessageOptions,
  ProviderMessage,
  ProviderMediaInput,
  SendMediaOptions,
  ProviderContact,
  MessageType,
  MessageAck
} from "../types";
import { WhatsappProvider } from "../whatsappProvider";
import { sleep } from "../../../utils/sleep";
import {
  handleMessage,
  handleMessageAck,
  ContactPayload,
  MessagePayload,
  MediaPayload,
  WhatsappContextPayload
} from "../../../handlers/handleWhatsappEvents";

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
          const deviceId = jidDecode(creds?.me?.id)?.device || 1;

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
          const deviceId = jidDecode(creds?.me?.id)?.device || 1;

          try {
            const promises: Promise<void>[] = [];

            Object.entries(data).forEach(([category, categoryData]) => {
              Object.entries(categoryData as any).forEach(([id, value]) => {
                const key = `wpp:${sessionId}:${deviceId}:${category}:${id}`;
                const valueJson = JSON.stringify(value, BufferJSON.replacer); // TODDO implement clean session and keysToStore option
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

const mapMessageType = (msg: WAMessage): MessageType => {
  const messageType = getContentType(msg.message || undefined);

  const typeMap: Record<string, MessageType> = {
    conversation: "chat",
    extendedTextMessage: "chat",
    imageMessage: "image",
    videoMessage: "video",
    audioMessage: "audio",
    documentMessage: "document",
    stickerMessage: "sticker",
    locationMessage: "location",
    contactMessage: "vcard",
    contactsArrayMessage: "vcard"
  };

  const mappedType = typeMap[messageType || ""];

  if (messageType === "audioMessage") {
    const audioMsg = msg.message?.audioMessage;
    if (audioMsg?.ptt) {
      return "ptt";
    }
  }

  return mappedType || "chat";
};

const getMessageBody = (msg: WAMessage): string => {
  try {
    const messageType = getContentType(msg.message || undefined);

    if (messageType === "conversation") {
      return msg.message?.conversation || "";
    }

    if (messageType === "extendedTextMessage") {
      return msg.message?.extendedTextMessage?.text || "";
    }

    if (messageType === "imageMessage") {
      return msg.message?.imageMessage?.caption || "";
    }

    if (messageType === "videoMessage") {
      return msg.message?.videoMessage?.caption || "";
    }

    if (messageType === "documentMessage") {
      return msg.message?.documentMessage?.caption || "";
    }

    if (messageType === "contactMessage") {
      return msg.message?.contactMessage?.vcard || "";
    }

    if (messageType === "contactsArrayMessage") {
      const contacts = msg.message?.contactsArrayMessage?.contacts || [];
      return contacts.map(c => c.vcard).join("\n");
    }

    if (messageType === "locationMessage") {
      const location = msg.message?.locationMessage;
      if (location) {
        const gmapsUrl = `https://maps.google.com/maps?q=${location.degreesLatitude}%2C${location.degreesLongitude}&z=17&hl=pt-BR`;
        const description =
          location.name ||
          `${location.degreesLatitude}, ${location.degreesLongitude}`;
        return `${gmapsUrl}|${description}`;
      }
    }

    return "";
  } catch (err) {
    logger.error({ info: "Error getting message body", err });
    return "";
  }
};

const getQuotedMessageId = (msg: WAMessage): string | undefined => {
  const messageType = getContentType(msg.message || undefined);

  if (messageType === "extendedTextMessage") {
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    return contextInfo?.stanzaId || undefined;
  }

  if (messageType === "imageMessage") {
    const contextInfo = msg.message?.imageMessage?.contextInfo;
    return contextInfo?.stanzaId || undefined;
  }

  if (messageType === "videoMessage") {
    const contextInfo = msg.message?.videoMessage?.contextInfo;
    return contextInfo?.stanzaId || undefined;
  }

  if (messageType === "documentMessage") {
    const contextInfo = msg.message?.documentMessage?.contextInfo;
    return contextInfo?.stanzaId || undefined;
  }

  return undefined;
};

const hasMedia = (msg: WAMessage): boolean => {
  const messageType = getContentType(msg.message || undefined);
  return [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage"
  ].includes(messageType || "");
};

const shouldHandleMessage = (msg: WAMessage): boolean => {
  const messageType = getContentType(msg.message || undefined);
  const validTypes = [
    "conversation",
    "extendedTextMessage",
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage",
    "locationMessage",
    "contactMessage",
    "contactsArrayMessage"
  ];

  if (!validTypes.includes(messageType || "")) {
    return false;
  }

  const body = getMessageBody(msg);
  if (/\u200e/.test(body[0])) return false;

  if (msg.key.fromMe) {
    if (
      !hasMedia(msg) &&
      messageType !== "locationMessage" &&
      messageType !== "conversation" &&
      messageType !== "extendedTextMessage" &&
      messageType !== "contactMessage"
    ) {
      return false;
    }
  }

  return true;
};

const convertToMessagePayload = (msg: WAMessage): MessagePayload => {
  const fromJid = msg.key.remoteJid || "";
  const toJid = msg.key.fromMe ? fromJid : msg.key.participant || fromJid;
  const fromMe = msg.key.fromMe || false;

  return {
    id: msg.key.id || "",
    body: getMessageBody(msg),
    fromMe,
    hasMedia: hasMedia(msg),
    type: mapMessageType(msg),
    timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : Date.now(),
    from: fromJid,
    to: toJid,
    hasQuotedMsg: Boolean(getQuotedMessageId(msg)),
    quotedMsgId: getQuotedMessageId(msg),
    ack: fromMe ? 1 : 0
  };
};

const convertToContactPayload = async (
  wbot: Session,
  jid: string
): Promise<ContactPayload> => {
  const normalizedJid = jidNormalizedUser(jid);
  const [number] = normalizedJid.split("@");

  const name = number;
  let profilePicUrl: string | undefined;

  try {
    profilePicUrl = await wbot
      .profilePictureUrl(normalizedJid, "image")
      .catch(() => undefined);
  } catch (err) {
    logger.debug({ info: "Error getting profile picture", jid, err });
  }

  return {
    id: number,
    name,
    number,
    profilePicUrl,
    isGroup: Boolean(isJidGroup(jid))
  };
};

const convertToMediaPayload = async (
  msg: WAMessage,
  wbot: Session
): Promise<MediaPayload | undefined> => {
  if (!hasMedia(msg)) return undefined;

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger: logger as any, reuploadRequest: wbot.updateMediaMessage }
    );

    const messageType = getContentType(msg.message || undefined);
    let filename = "";
    let mimetype = "";

    if (messageType === "imageMessage") {
      const imageMsg = msg.message?.imageMessage;
      mimetype = imageMsg?.mimetype || "image/jpeg";
      const ext = mimetype.split("/")[1]?.split(";")[0] || "jpg";
      filename = `image-${Date.now()}.${ext}`;
    } else if (messageType === "videoMessage") {
      const videoMsg = msg.message?.videoMessage;
      mimetype = videoMsg?.mimetype || "video/mp4";
      const ext = mimetype.split("/")[1]?.split(";")[0] || "mp4";
      filename = `video-${Date.now()}.${ext}`;
    } else if (messageType === "audioMessage") {
      const audioMsg = msg.message?.audioMessage;
      mimetype = audioMsg?.mimetype || "audio/ogg; codecs=opus";
      filename = `audio-${Date.now()}.ogg`;
    } else if (messageType === "documentMessage") {
      const docMsg = msg.message?.documentMessage;
      mimetype = docMsg?.mimetype || "application/octet-stream";
      const ext = mimetype.split("/")[1]?.split(";")[0] || "bin";
      filename = docMsg?.title || `document-${Date.now()}.${ext}`;
    } else if (messageType === "stickerMessage") {
      const stickerMsg = msg.message?.stickerMessage;
      mimetype = stickerMsg?.mimetype || "image/webp";
      filename = `sticker-${Date.now()}.webp`;
    }

    return {
      filename,
      mimetype,
      data: buffer.toString("base64")
    };
  } catch (err) {
    logger.error({
      info: "Error downloading media",
      err,
      messageId: msg.key.id
    });
    return undefined;
  }
};

const getMessageData = async (
  msg: WAMessage,
  wbot: Session
): Promise<{
  messagePayload: MessagePayload;
  contactPayload: ContactPayload;
  contextPayload: WhatsappContextPayload;
  mediaPayload: MediaPayload | undefined;
}> => {
  const remoteJid = msg.key.remoteJid || "";
  const isGroup = isJidGroup(remoteJid);

  let contactJid: string;
  let groupContact: ContactPayload | undefined;

  if (msg.key.fromMe) {
    contactJid = remoteJid;
  } else if (isGroup) {
    const participantJid = msg.key.participant || msg.participant || "";
    contactJid = participantJid;
    groupContact = await convertToContactPayload(wbot, remoteJid);
  } else {
    contactJid = remoteJid;
  }

  const contactPayload = await convertToContactPayload(wbot, contactJid);
  const messagePayload = convertToMessagePayload(msg);
  const mediaPayload = await convertToMediaPayload(msg, wbot);

  const contextPayload: WhatsappContextPayload = {
    whatsappId: wbot.id,
    unreadMessages: 0,
    groupContact
  };

  return {
    messagePayload,
    contactPayload,
    contextPayload,
    mediaPayload
  };
};

const getWbot = (sessionId: number): Session => {
  const wbot = sessions.get(sessionId);

  if (!wbot) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }

  return wbot;
};

const removeSession = async (whatsappId: number): Promise<void> => {
  sessions.delete(whatsappId);
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  const sessionId = whatsapp.id;
  const io = getIO();

  const { state, saveCreds } = await useSessionAuthState(whatsapp);

  const connOptions: UserFacingSocketConfig = {
    browser: ["Windows", "Chrome", "Chrome 114.0.5735.198"],
    emitOwnEvents: true,
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
    version: [2, 3000, 1029659368]
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
  wbot.id = sessionId;

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
          await whatsapp.update({ status: "OPENING" });
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

  wbot.ev.on("messages.upsert", async m => {
    const validMessages = m.messages.filter(
      msg => msg.message && shouldHandleMessage(msg)
    );

    await Promise.all(
      validMessages.map(async msg => {
        try {
          const {
            messagePayload,
            contactPayload,
            contextPayload,
            mediaPayload
          } = await getMessageData(msg, wbot);

          await handleMessage(
            messagePayload,
            contactPayload,
            contextPayload,
            mediaPayload
          );
        } catch (err) {
          logger.error(err, "Error handling message upsert");
        }
      })
    );
  });

  wbot.ev.on("messages.update", async updates => {
    await Promise.all(
      updates.map(async update => {
        try {
          if (update.update.status) {
            const ackMap: Record<number, MessageAck> = {
              0: 0,
              1: 1,
              2: 2,
              3: 3,
              4: 4
            };

            const ack = ackMap[update.update.status] || 0;
            await handleMessageAck(update.key.id || "", ack);
          }
        } catch (err) {
          logger.error({
            info: "Error handling message update",
            err,
            messageId: update.key.id
          });
        }
      })
    );
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
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  try {
    const messageContent: any = options?.quotedMessageId
      ? {
          text: body,
          contextInfo: {
            stanzaId: options.quotedMessageId,
            participant: options.quotedMessageFromMe ? wbot.user?.id : to
          }
        }
      : { text: body };

    const sentMsg = await wbot.sendMessage(to, messageContent);

    if (!sentMsg?.key.id) {
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }

    return {
      id: sentMsg.key.id,
      body,
      fromMe: true,
      hasMedia: false,
      type: "chat",
      timestamp: sentMsg.messageTimestamp
        ? Number(sentMsg.messageTimestamp)
        : Date.now(),
      from: wbot.user?.id || "",
      to,
      ack: 1
    };
  } catch (err) {
    logger.error({ info: "Error sending message", err, sessionId, to });
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  try {
    const mediaBuffer = media.path ? readFileSync(media.path) : media.data;

    if (!mediaBuffer) {
      throw new AppError("ERR_NO_MEDIA_DATA");
    }

    const contextInfo = options?.quotedMessageId
      ? {
          stanzaId: options.quotedMessageId,
          participant: to
        }
      : undefined;

    let messageContent: any;
    let messageType: MessageType;

    if (media.mimetype.startsWith("image/")) {
      messageContent = {
        image: mediaBuffer,
        caption: options?.caption,
        mimetype: media.mimetype,
        contextInfo
      };
      messageType = "image";
    } else if (media.mimetype.startsWith("video/")) {
      messageContent = {
        video: mediaBuffer,
        caption: options?.caption,
        mimetype: media.mimetype,
        contextInfo
      };
      messageType = "video";
    } else if (media.mimetype.startsWith("audio/")) {
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype,
        ptt: options?.sendAudioAsVoice || false,
        contextInfo
      };
      messageType = options?.sendAudioAsVoice ? "ptt" : "audio";
    } else {
      messageContent = {
        document: mediaBuffer,
        caption: options?.caption,
        mimetype: media.mimetype,
        fileName: media.filename,
        contextInfo
      };
      messageType = "document";
    }

    const sentMsg = await wbot.sendMessage(to, messageContent);

    if (!sentMsg) {
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }

    return {
      id: sentMsg.key.id || "",
      body: options?.caption || media.filename,
      fromMe: true,
      hasMedia: true,
      type: messageType,
      timestamp: sentMsg.messageTimestamp
        ? Number(sentMsg.messageTimestamp)
        : Date.now(),
      from: wbot.user?.id || "",
      to,
      ack: 1
    };
  } catch (err) {
    logger.error({ info: "Error sending media", err, sessionId, to });
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
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
