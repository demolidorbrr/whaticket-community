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
  jidDecode,
  makeInMemoryStore,
  SignalDataSet,
  AnyMessageContent
} from "whaileys";
import { Boom } from "@hapi/boom";
import { HttpsProxyAgent } from "https-proxy-agent";
import NodeCache from "node-cache";

import Whatsapp from "../../../models/Whatsapp";
import { getIO } from "../../../libs/socket";
import { logger } from "../../../utils/logger";
import AppError from "../../../errors/AppError";
import StoreWppSessionKeys from "../../../services/WppKeyServices/StoreWppSessionKeys";
import GetWppSessionKeys from "../../../services/WppKeyServices/GetWppSessionKeys";
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

type WALogger = NonNullable<Parameters<typeof makeInMemoryStore>[0]["logger"]>;

type Store = ReturnType<typeof makeInMemoryStore>;

interface Session extends WASocket {
  id: number;
  store?: Store;
}

const sessions = new Map<number, Session>();
const stores = new Map<number, Store>();

const assertUnique = (sessionId: number) => {
  const wbot = sessions.get(sessionId);

  if (wbot) {
    wbot.ev.removeAllListeners("connection.update");
    sessions.delete(sessionId);
    stores.delete(sessionId);

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
          const deviceId = jidDecode(creds?.me?.id)?.device || 1;

          const data = await GetWppSessionKeys({
            connectionId: sessionId,
            deviceId,
            type,
            ids
          });

          return data;
        },
        set: async (data: SignalDataSet) => {
          const deviceId = jidDecode(creds?.me?.id)?.device || 1;

          try {
            const promises: Promise<void>[] = [];

            Object.entries(data).forEach(([category, categoryData]) => {
              if (!categoryData) return;
              Object.entries(categoryData).forEach(([id, value]) => {
                promises.push(
                  StoreWppSessionKeys({
                    connectionId: sessionId,
                    deviceId,
                    type: category,
                    id,
                    value
                  })
                );
              });
            });

            await Promise.all(promises);
          } catch (err) {
            logger.error({
              info: "Error setting keys",
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

  if (messageType === "audioMessage" && msg.message?.audioMessage?.ptt) {
    return "ptt";
  }

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

  return typeMap[messageType || ""] || "chat";
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
      if (!location) return "";

      const gmapsUrl = `https://maps.google.com/maps?q=${location.degreesLatitude}%2C${location.degreesLongitude}&z=17&hl=pt-BR`;
      const description =
        location.name ||
        `${location.degreesLatitude}, ${location.degreesLongitude}`;

      return `${gmapsUrl}|${description}`;
    }

    return "";
  } catch (err) {
    logger.error({ info: "Error getting message body", err });
    return "";
  }
};

const getQuotedMessageId = (msg: WAMessage): string | undefined => {
  const quotedMessageId =
    msg.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    msg.message?.imageMessage?.contextInfo?.stanzaId ||
    msg.message?.videoMessage?.contextInfo?.stanzaId ||
    msg.message?.documentMessage?.contextInfo?.stanzaId ||
    undefined;

  return quotedMessageId;
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

const mapMessageAck = (status: number | null | undefined): MessageAck => {
  if (status === null || status === undefined) return 0;
  if (status >= 4) return 4;
  if (status >= 3) return 3;
  if (status >= 2) return 2;
  if (status >= 1) return 1;
  return 0;
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

  if (!validTypes.includes(messageType || "")) return false;

  const body = getMessageBody(msg);
  if (/\u200e/.test(body[0])) return false;

  if (!msg.key.fromMe) return true;

  const allowedFromMeTypes = [
    "locationMessage",
    "conversation",
    "extendedTextMessage",
    "contactMessage"
  ];

  return hasMedia(msg) || allowedFromMeTypes.includes(messageType || "");
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
  jid: string,
  msg: WAMessage
): Promise<ContactPayload> => {
  const normalizedJid = jidNormalizedUser(jid);

  if (isJidGroup(jid)) {
    const groupNumber = normalizedJid.split("@")[0];

    return {
      name: groupNumber,
      number: groupNumber,
      isGroup: true
    };
  }

  const number =
    (isJidUser(jid) && jidDecode(jid)?.user) ||
    jidDecode(msg.key.senderPn)?.user ||
    normalizedJid.split("@")[0];

  const lid =
    (isLidUser(jid) && jidDecode(jid)?.user) ||
    jidDecode(msg.key.senderLid || msg.key.recipientLid)?.user;

  const name = msg.pushName || number || lid || "";

  return {
    name,
    number,
    lid,
    isGroup: false
  };
};

const convertToMediaPayload = async (
  msg: WAMessage,
  wbot: Session
): Promise<MediaPayload | undefined> => {
  if (!hasMedia(msg)) return undefined;

  // TODO save direct to disc using stream
  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: logger as unknown as WALogger,
        reuploadRequest: wbot.updateMediaMessage
      }
    );

    const messageType = getContentType(msg.message || undefined);
    const getExtension = (mimetype: string, fallback: string): string =>
      mimetype.split("/")[1]?.split(";")[0] || fallback;

    if (messageType === "imageMessage") {
      const mimetype = msg.message?.imageMessage?.mimetype || "image/jpeg";
      return {
        filename: `image-${Date.now()}.${getExtension(mimetype, "jpg")}`,
        mimetype,
        data: buffer.toString("base64")
      };
    }

    if (messageType === "videoMessage") {
      const mimetype = msg.message?.videoMessage?.mimetype || "video/mp4";
      return {
        filename: `video-${Date.now()}.${getExtension(mimetype, "mp4")}`,
        mimetype,
        data: buffer.toString("base64")
      };
    }

    if (messageType === "audioMessage") {
      const mimetype =
        msg.message?.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      return {
        filename: `audio-${Date.now()}.ogg`,
        mimetype,
        data: buffer.toString("base64")
      };
    }

    if (messageType === "documentMessage") {
      const docMsg = msg.message?.documentMessage;
      const mimetype = docMsg?.mimetype || "application/octet-stream";
      const ext = getExtension(mimetype, "bin");
      return {
        filename: docMsg?.title || `document-${Date.now()}.${ext}`,
        mimetype,
        data: buffer.toString("base64")
      };
    }

    if (messageType === "stickerMessage") {
      const mimetype = msg.message?.stickerMessage?.mimetype || "image/webp";
      return {
        filename: `sticker-${Date.now()}.webp`,
        mimetype,
        data: buffer.toString("base64")
      };
    }

    return {
      filename: "",
      mimetype: "",
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

  let contactJid = remoteJid;
  let groupContact;

  if (!msg.key.fromMe && isGroup && msg.key.participant) {
    contactJid = msg.key.participant;
    groupContact = await convertToContactPayload(remoteJid, msg);
  }

  const contactPayload = await convertToContactPayload(contactJid, msg);
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
  stores.delete(whatsappId);
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
        logger as unknown as WALogger,
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

  const store = makeInMemoryStore({ logger: logger as unknown as WALogger });
  stores.set(sessionId, store);

  const wbot = makeWASocket(connOptions) as Session;
  wbot.id = sessionId;
  wbot.store = store;

  store.bind(wbot.ev);

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

        return;
      }

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut; // TODO handle other cases

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
      updates.map(async event => {
        try {
          if (!event.update.status || !event.key.id) return;

          const ack = (event.update.status as MessageAck) || 0;
          await handleMessageAck(event.key.id, ack);
        } catch (err) {
          logger.error({
            info: "Error handling message update",
            err,
            messageId: event.key.id
          });
        }
      })
    );
  });
};

const logout = async (sessionId: number): Promise<void> => {
  const wbot = sessions.get(sessionId);

  if (wbot) {
    await wbot
      .logout()
      .catch(err => logger.error({ info: "Error on logout", sessionId, err }));
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

  const messageContent: AnyMessageContent = options?.quotedMessageId
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
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  const mediaBuffer = media.path ? readFileSync(media.path) : media.data;
  if (!mediaBuffer) throw new AppError("ERR_NO_MEDIA_DATA");

  const contextInfo = options?.quotedMessageId
    ? { stanzaId: options.quotedMessageId, participant: to }
    : undefined;

  const buildPayload = () => {
    const base = {
      caption: options?.caption,
      mimetype: media.mimetype,
      contextInfo
    };

    if (media.mimetype.startsWith("image/")) {
      return {
        message: { image: mediaBuffer, ...base },
        type: "image" as MessageType
      };
    }

    if (media.mimetype.startsWith("video/")) {
      return {
        message: { video: mediaBuffer, ...base },
        type: "video" as MessageType
      };
    }

    if (media.mimetype.startsWith("audio/")) {
      const ptt = Boolean(options?.sendAudioAsVoice);
      return {
        message: {
          audio: mediaBuffer,
          mimetype: media.mimetype,
          ptt,
          contextInfo
        },
        type: ptt ? "ptt" : ("audio" as MessageType)
      };
    }

    return {
      message: {
        document: mediaBuffer,
        caption: options?.caption,
        mimetype: media.mimetype,
        fileName: media.filename,
        contextInfo
      },
      type: "document" as MessageType
    };
  };

  const { message, type } = buildPayload();

  const sent = await wbot.sendMessage(to, message);
  if (!sent?.key?.id) throw new AppError("ERR_SENDING_WAPP_MEDIA_MSG");

  return {
    id: sent.key.id,
    body: options?.caption || media.filename,
    fromMe: true,
    hasMedia: true,
    type,
    timestamp: sent.messageTimestamp
      ? Number(sent.messageTimestamp)
      : Date.now(),
    from: wbot.user?.id || "",
    to,
    ack: 1
  };
};

const deleteMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  const wbot = getWbot(sessionId);

  const key = {
    remoteJid: chatId,
    id: messageId,
    fromMe
  };

  await wbot.sendMessage(chatId, { delete: key });
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);

  const cleanNumber = number.replace(/\D/g, "");

  const [result] = await wbot.onWhatsApp(cleanNumber);

  if (!result?.exists) {
    throw new AppError("ERR_NUMBER_NOT_ON_WHATSAPP", 404);
  }

  return result.jid;
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);

  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;

  try {
    const url = await wbot.profilePictureUrl(jid, "image");
    return url || "";
  } catch (err) {
    logger.debug({
      info: "Could not get profile picture",
      number,
      err
    });
    return "";
  }
};

const getContacts = async (sessionId: number): Promise<ProviderContact[]> => {
  const wbot = getWbot(sessionId);

  const contacts: ProviderContact[] = [];

  if (wbot.store?.contacts) {
    Object.values(wbot.store.contacts).forEach(contact => {
      if (contact.id && isJidUser(contact.id)) {
        contacts.push({
          id: contact.id,
          number: jidNormalizedUser(contact.id).replace("@s.whatsapp.net", ""),
          name: contact.name || contact.notify || "",
          pushname: contact.notify || "",
          isGroup: false
        });
      }
    });
  }

  return contacts;
};

const sendSeen = async (sessionId: number, chatId: string): Promise<void> => {
  const wbot = getWbot(sessionId);

  const lastMessages = wbot.store?.messages?.[chatId]?.array?.slice(-5) || [];

  if (lastMessages.length === 0) {
    return;
  }

  const keys = lastMessages
    .filter(msg => !msg.key.fromMe && msg.key.id)
    .map(msg => ({
      remoteJid: chatId,
      id: msg.key.id!,
      participant: msg.key.participant
    }));

  if (keys.length > 0) {
    await wbot.readMessages(keys);
  }
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const wbot = getWbot(sessionId);

  const messagesFromStore = wbot.store?.messages?.[chatId]?.array || [];

  const messages = messagesFromStore.slice(-limit);

  return messages.map(msg => ({
    id: msg.key.id || "",
    body: getMessageBody(msg),
    fromMe: msg.key.fromMe || false,
    hasMedia: hasMedia(msg),
    type: mapMessageType(msg),
    timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : Date.now(),
    from: msg.key.participant || msg.key.remoteJid || "",
    to: chatId,
    ack: mapMessageAck(msg.status)
  }));
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
