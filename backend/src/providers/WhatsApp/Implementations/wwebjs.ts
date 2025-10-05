import qrCode from "qrcode-terminal";
import {
  Client,
  LocalAuth,
  MessageMedia,
  Message as WbotMessage,
  MessageSendOptions
} from "whatsapp-web.js";
import { getIO } from "../../../libs/socket";
import Whatsapp from "../../../models/Whatsapp";
import AppError from "../../../errors/AppError";
import { logger } from "../../../utils/logger";
import {
  wbotMessageListener,
  handleMessage
} from "../../../services/WbotServices/wbotMessageListener";
import { WhatsappProvider } from "../whatsappProvider";
import {
  ProviderMessage,
  ProviderMediaInput,
  SendMessageOptions,
  SendMediaOptions,
  MessageType,
  MessageAck,
  ProviderContact
} from "../types";

interface Session extends Client {
  id?: number;
}

const sessions: Session[] = [];

// Utility functions
const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

const mapMessageType = (wbotType: any): MessageType => {
  const typeMap: Record<string, MessageType> = {
    chat: MessageType.CHAT,
    audio: MessageType.AUDIO,
    ptt: MessageType.PTT,
    video: MessageType.VIDEO,
    image: MessageType.IMAGE,
    document: MessageType.DOCUMENT,
    vcard: MessageType.VCARD,
    sticker: MessageType.STICKER,
    location: MessageType.LOCATION
  };
  return typeMap[wbotType] || MessageType.CHAT;
};

const mapMessageAck = (wbotAck: any): MessageAck => {
  const ackMap: Record<number, MessageAck> = {
    0: MessageAck.PENDING,
    1: MessageAck.SERVER,
    2: MessageAck.DEVICE,
    3: MessageAck.READ,
    4: MessageAck.PLAYED
  };
  return ackMap[wbotAck] || MessageAck.PENDING;
};

const convertToProviderMessage = (
  wbotMessage: WbotMessage
): ProviderMessage => {
  return {
    id: wbotMessage.id.id,
    body: wbotMessage.body,
    fromMe: wbotMessage.fromMe,
    hasMedia: wbotMessage.hasMedia,
    type: mapMessageType(wbotMessage.type),
    timestamp: wbotMessage.timestamp,
    from: wbotMessage.from,
    to: wbotMessage.to,
    hasQuotedMsg: wbotMessage.hasQuotedMsg,
    ack: mapMessageAck(wbotMessage.ack),
    delete: (param: boolean) => wbotMessage.delete(param)
  };
};

const getSerializedMessageId = (
  chatId: string,
  fromMe: boolean,
  messageId: string
): string => {
  const serializedMsgId = `${fromMe}_${chatId}_${messageId}`;

  return serializedMsgId;
};

const syncUnreadMessages = async (wbot: Session) => {
  const chats = await wbot.getChats();

  /* eslint-disable no-restricted-syntax */
  /* eslint-disable no-await-in-loop */
  for (const chat of chats) {
    if (chat.unreadCount > 0) {
      const unreadMessages = await chat.fetchMessages({
        limit: chat.unreadCount
      });

      for (const msg of unreadMessages) {
        await handleMessage(msg, wbot);
      }

      await chat.sendSeen();
    }
  }
};

const init = async (whatsapp: Whatsapp): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const io = getIO();
      const sessionName = whatsapp.name;
      let sessionCfg;

      if (whatsapp && whatsapp.session) {
        sessionCfg = JSON.parse(whatsapp.session);
      }

      const args: string = process.env.CHROME_ARGS || "";

      const wbot: Session = new Client({
        session: sessionCfg,
        authStrategy: new LocalAuth({ clientId: `bd_${whatsapp.id}` }),
        puppeteer: {
          executablePath: process.env.CHROME_BIN || undefined,
          browserWSEndpoint: process.env.CHROME_WS || undefined,
          args: args.split(" ")
        }
      });

      wbot.initialize();

      wbot.on("qr", async qr => {
        logger.info("Session:", sessionName);
        qrCode.generate(qr, { small: true });
        await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });

        const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
        if (sessionIndex === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });
      });

      wbot.on("authenticated", async () => {
        logger.info(`Session: ${sessionName} AUTHENTICATED`);
      });

      wbot.on("auth_failure", async msg => {
        console.error(
          `Session: ${sessionName} AUTHENTICATION FAILURE! Reason: ${msg}`
        );

        if (whatsapp.retries > 1) {
          await whatsapp.update({ session: "", retries: 0 });
        }

        const retry = whatsapp.retries;
        await whatsapp.update({
          status: "DISCONNECTED",
          retries: retry + 1
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        reject(new Error("Error starting whatsapp session."));
      });

      wbot.on("ready", async () => {
        logger.info(`Session: ${sessionName} READY`);

        await whatsapp.update({
          status: "CONNECTED",
          qrcode: "",
          retries: 0
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
        if (sessionIndex === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        wbot.sendPresenceAvailable();
        await syncUnreadMessages(wbot);

        // Connect the existing wbotMessageListener to this session
        wbotMessageListener(wbot);

        resolve();
      });
    } catch (err) {
      logger.error(err);
    }
  });
};

const removeSession = (whatsappId: number): void => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].destroy();
      sessions.splice(sessionIndex, 1);
    }
  } catch (err) {
    logger.error(err);
  }
};

const sendMessage = async (
  sessionId: number,
  to: string,
  body: string,
  options?: SendMessageOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  const quotedMsgSerializedId = options?.quotedMessageId
    ? getSerializedMessageId(
        to,
        Boolean(options?.quotedMessageFromMe),
        options?.quotedMessageId
      )
    : "";

  const sentMessage = await wbot.sendMessage(to, body, {
    quotedMessageId: quotedMsgSerializedId,
    linkPreview: options?.linkPreview
  });

  return convertToProviderMessage(sentMessage);
};

const sendMedia = async (
  sessionId: number,
  to: string,
  media: ProviderMediaInput,
  options?: SendMediaOptions
): Promise<ProviderMessage> => {
  const wbot = getWbot(sessionId);

  const messageMedia = media.path
    ? MessageMedia.fromFilePath(media.path)
    : new MessageMedia(
        media.mimetype,
        media.data?.toString("base64") || "",
        media.filename
      );

  const mediaOptions: MessageSendOptions = {
    caption: options?.caption,
    sendAudioAsVoice: options?.sendAudioAsVoice,
    quotedMessageId: options?.quotedMessageId
  };

  if (
    messageMedia.mimetype.startsWith("image/") &&
    !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
  ) {
    mediaOptions.sendMediaAsDocument = options?.sendMediaAsDocument || true;
  }

  const sentMessage = await wbot.sendMessage(to, messageMedia, mediaOptions);
  return convertToProviderMessage(sentMessage);
};

const checkNumber = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);
  const validNumber = await wbot.getNumberId(`${number}@c.us`);

  return validNumber?.user || "";
};

const getProfilePicUrl = async (
  sessionId: number,
  number: string
): Promise<string> => {
  const wbot = getWbot(sessionId);
  const profilePicUrl = await wbot.getProfilePicUrl(`${number}@c.us`);
  return profilePicUrl;
};

const sendSeen = async (sessionId: number, chatId: string): Promise<void> => {
  const wbot = getWbot(sessionId);
  const chat = await wbot.getChatById(chatId);
  await chat.sendSeen();
};

const fetchChatMessages = async (
  sessionId: number,
  chatId: string,
  limit = 100
): Promise<ProviderMessage[]> => {
  const wbot = getWbot(sessionId);
  const chat = await wbot.getChatById(chatId);
  const messages = await chat.fetchMessages({ limit });

  return messages.map(convertToProviderMessage);
};

const getContacts = async (sessionId: number): Promise<ProviderContact[]> => {
  const wbot = getWbot(sessionId);
  const contacts = await wbot.getContacts();
  console.log("🚀 ~ contacts:", contacts);

  return contacts.map(contact => ({
    id: contact.id.user,
    name: contact.name || contact.pushname,
    pushname: contact.pushname,
    number: contact.id.user,
    profilePicUrl: undefined, // getProfilePicUrl would need to be called separately
    isGroup: contact.isGroup
  }));
};

const logout = async (sessionId: number): Promise<void> => {
  const wbot = getWbot(sessionId);
  await wbot.logout();
};

const deleteMessage = async (
  sessionId: number,
  chatId: string,
  messageId: string,
  fromMe: boolean
): Promise<void> => {
  const wbot = getWbot(sessionId);

  const serializedMsgId = getSerializedMessageId(chatId, fromMe, messageId);

  const message = await wbot.getMessageById(serializedMsgId);

  await message.delete(true);
};

export const WhatsappWebJsProvider: WhatsappProvider = {
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
