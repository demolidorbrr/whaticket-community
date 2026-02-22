import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import * as Sentry from "@sentry/node";

import { emitToCompanyRooms, getCompanyTicketRoom } from "../libs/socket";
import { logger } from "../utils/logger";
import { debounce } from "../helpers/Debounce";
import formatBody from "../helpers/Mustache";

import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Message from "../models/Message";

import CreateMessageService from "../services/MessageServices/CreateMessageService";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import CreateContactService from "../services/ContactServices/CreateContactService";
import ProcessQueueAssistantService from "../services/AIServices/ProcessQueueAssistantService";
import StartTicketSLAService from "../services/SLAServices/StartTicketSLAService";
import { runWithTenantContext } from "../libs/tenantContext";

import { whatsappProvider } from "../providers/WhatsApp/whatsappProvider";
import { MessageType, MessageAck } from "../providers/WhatsApp/types";

const writeFileAsync = promisify(writeFile);

const pendingMessageAcks = new Map<string, MessageAck>();

const mergeAck = (currentAck: number | undefined, incomingAck?: MessageAck): MessageAck => {
  const safeCurrent = typeof currentAck === "number" ? currentAck : 0;
  const safeIncoming = typeof incomingAck === "number" ? incomingAck : safeCurrent;
  return Math.max(safeCurrent, safeIncoming) as MessageAck;
};

const storePendingAck = (messageId: string, ack: MessageAck): void => {
  const current = pendingMessageAcks.get(messageId);
  pendingMessageAcks.set(messageId, mergeAck(current, ack));
};

const consumePendingAck = (messageId: string): MessageAck | undefined => {
  const ack = pendingMessageAcks.get(messageId);
  if (ack !== undefined) {
    pendingMessageAcks.delete(messageId);
  }
  return ack;
};

const messagePreviewByType: Record<string, string> = {
  image: "[Imagem]",
  video: "[Video]",
  audio: "[Audio]",
  ptt: "[Audio]",
  document: "[Documento]",
  sticker: "[Sticker]",
  vcard: "[Contato]",
  location: "[Localizacao]"
};

const normalizePreviewText = (value?: string): string => {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
};

const buildLastMessagePreview = (
  message: MessagePayload,
  media?: MediaPayload
): string => {
  const normalizedBody = normalizePreviewText(message.body);
  if (normalizedBody) {
    return normalizedBody;
  }

  const previewByType = messagePreviewByType[message.type];
  if (previewByType) {
    return previewByType;
  }

  const mediaFilename = normalizePreviewText(media?.filename);
  if (mediaFilename) {
    return mediaFilename;
  }

  if (message.hasMedia) {
    return "[Midia]";
  }

  return "";
};

export interface ContactPayload {
  name: string;
  number: string;
  lid?: string;
  profilePicUrl?: string;
  isGroup: boolean;
}

export interface MessagePayload {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  quotedMsgId?: string;
  mediaUrl?: string;
  mediaType?: string;
  ack?: MessageAck;
}

export interface MediaPayload {
  filename: string;
  mimetype: string;
  data: string;
}

export interface WhatsappContextPayload {
  whatsappId: number;
  unreadMessages: number;
  groupContact?: ContactPayload;
}

const makeRandomId = (length: number): string => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
};

const processLocationMessage = (
  messagePayload: MessagePayload
): MessagePayload => {
  if (messagePayload.type !== "location") return messagePayload;

  return messagePayload;
};

const saveMediaFile = async (mediaPayload: MediaPayload): Promise<string> => {
  const randomId = makeRandomId(5);
  const { filename: originalFilename } = mediaPayload;

  let filename: string;
  if (!originalFilename) {
    const [extension] = mediaPayload.mimetype.split("/")[1].split(";");
    filename = `${randomId}-${new Date().getTime()}.${extension}`;
  } else {
    const baseName = originalFilename.split(".").slice(0, -1).join(".");
    const extension = originalFilename.split(".").slice(-1)[0];
    filename = `${baseName}.${randomId}.${extension}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "public", filename),
      mediaPayload.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  return filename;
};

const processVcardMessage = async (
  messagePayload: MessagePayload
): Promise<void> => {
  if (messagePayload.type !== "vcard") return;

  try {
    const array = messagePayload.body.split("\n");
    const phoneNumbers: Array<{ number: string }> = [];
    let contactName = "";

    array.forEach(line => {
      const values = line.split(":");
      values.forEach((value, index) => {
        if (value.indexOf("+") !== -1) {
          phoneNumbers.push({ number: value });
        }
        if (value.indexOf("FN") !== -1 && values[index + 1]) {
          contactName = values[index + 1];
        }
      });
    });

    await Promise.all(
      phoneNumbers.map(({ number }) =>
        CreateContactService({
          name: contactName,
          number: number.replace(/\D/g, "")
        })
      )
    );
  } catch (error) {
    logger.error("Error processing vcard message:", error);
  }
};

const resolveQuotedMessageId = async (
  quotedMsgId?: string
): Promise<string | undefined> => {
  if (!quotedMsgId) return undefined;

  const quotedMessage = await Message.findByPk(quotedMsgId, {
    attributes: ["id"]
  });

  return quotedMessage ? quotedMsgId : undefined;
};

const handleQueueLogic = async (
  whatsappId: number,
  messageBody: string,
  ticket: Ticket,
  contactPayload: ContactPayload
): Promise<void> => {
  const { queues, greetingMessage } = await ShowWhatsAppService(whatsappId);

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });
    return;
  }

  const selectedOption = messageBody;
  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id
    });

    const body = formatBody(
      `\u200e${choosenQueue.greetingMessage}`,
      contactPayload as any
    );

    try {
      await whatsappProvider.sendMessage(
        whatsappId,
        `${contactPayload.number}@c.us`,
        body
      );
    } catch (error) {
      logger.error("Error sending queue greeting message:", error);
    }
  } else {
    let options = "";
    queues.forEach((queue, index) => {
      options += `*${index + 1}* - ${queue.name}\n`;
    });

    const body = formatBody(
      `\u200e${greetingMessage}\n${options}`,
      contactPayload as any
    );

    const debouncedSentMessage = debounce(
      async () => {
        try {
          await whatsappProvider.sendMessage(
            whatsappId,
            `${contactPayload.number}@c.us`,
            body
          );
        } catch (error) {
          logger.error("Error sending queue options message:", error);
        }
      },
      3000,
      ticket.id
    );

    debouncedSentMessage();
  }
};

export const handleMessage = async (
  messagePayload: MessagePayload,
  contactPayload: ContactPayload,
  contextPayload: WhatsappContextPayload,
  mediaPayload?: MediaPayload
): Promise<void> => {
  try {
    const whatsapp = await ShowWhatsAppService(contextPayload.whatsappId);
    const tenantCompanyId = (whatsapp as any).companyId ?? null;

    await runWithTenantContext(
      // Processa toda a mensagem dentro do tenant da conexao recebida.
      { companyId: tenantCompanyId, profile: "admin" },
      async () => {
        const processedMessage = processLocationMessage(messagePayload);
        const resolvedQuotedMsgId = await resolveQuotedMessageId(
          processedMessage.quotedMsgId
        );

        if (processedMessage.fromMe) {
          const existingOutgoingMessage = await Message.findByPk(processedMessage.id);

          if (existingOutgoingMessage) {
            const messageData: any = {
              id: processedMessage.id,
              ticketId: existingOutgoingMessage.ticketId,
              contactId: existingOutgoingMessage.contactId,
              body: processedMessage.body,
              fromMe: true,
              read: true,
              mediaType: processedMessage.type,
              quotedMsgId: resolvedQuotedMsgId,
              ack:
                processedMessage.ack !== undefined
                  ? processedMessage.ack
                  : existingOutgoingMessage.ack
            };

            const pendingAck = consumePendingAck(processedMessage.id);
            if (pendingAck !== undefined) {
              messageData.ack = mergeAck(messageData.ack, pendingAck);
            }

            if (mediaPayload && processedMessage.hasMedia) {
              const filename = await saveMediaFile(mediaPayload);
              messageData.mediaUrl = filename;
              messageData.body = processedMessage.body || filename;
              const [mediaType] = mediaPayload.mimetype.split("/");
              messageData.mediaType = mediaType;
            }

            await CreateMessageService({ messageData });
            return;
          }
        }

        const contact = await CreateOrUpdateContactService({
          name: contactPayload.name,
          number: contactPayload.number,
          lid: contactPayload.lid,
          profilePicUrl: contactPayload.profilePicUrl,
          isGroup: contactPayload.isGroup
        });

        let groupContact: Contact | undefined;
        if (contextPayload.groupContact) {
          groupContact = await CreateOrUpdateContactService({
            name: contextPayload.groupContact.name,
            number: contextPayload.groupContact.number,
            lid: contextPayload.groupContact.lid,
            profilePicUrl: contextPayload.groupContact.profilePicUrl,
            isGroup: contextPayload.groupContact.isGroup
          });
        }

        if (
          contextPayload.unreadMessages === 0 &&
          whatsapp.farewellMessage &&
          formatBody(whatsapp.farewellMessage, contact) === processedMessage.body
        ) {
          return;
        }

        const ticket = await FindOrCreateTicketService(
          contact,
          contextPayload.whatsappId,
          contextPayload.unreadMessages,
          groupContact
        );

        if (!processedMessage.fromMe) {
          await StartTicketSLAService(ticket, "system");
        }

        const messageData: any = {
          id: processedMessage.id,
          ticketId: ticket.id,
          contactId: processedMessage.fromMe ? undefined : contact.id,
          body: processedMessage.body,
          fromMe: processedMessage.fromMe,
          read: processedMessage.fromMe,
          mediaType: processedMessage.type,
          quotedMsgId: resolvedQuotedMsgId,
          ack:
            processedMessage.ack !== undefined
              ? processedMessage.ack
              : processedMessage.fromMe
                ? 1
                : 0
        };

        const pendingAck = consumePendingAck(processedMessage.id);
        if (pendingAck !== undefined) {
          messageData.ack = mergeAck(messageData.ack, pendingAck);
        }

        if (mediaPayload && processedMessage.hasMedia) {
          const filename = await saveMediaFile(mediaPayload);
          messageData.mediaUrl = filename;
          messageData.body = processedMessage.body || filename;
          const [mediaType] = mediaPayload.mimetype.split("/");
          messageData.mediaType = mediaType;
        }

        const lastMessageText = buildLastMessagePreview(
          processedMessage,
          mediaPayload
        );

        await ticket.update({ lastMessage: lastMessageText });

        await CreateMessageService({ messageData });

        await processVcardMessage(processedMessage);

        if (!processedMessage.fromMe) {
          await ProcessQueueAssistantService({
            ticket,
            messagePayload: processedMessage,
            contactPayload,
            whatsappId: contextPayload.whatsappId
          });
        }

        if (
          !ticket.queue &&
          !contextPayload.groupContact &&
          !processedMessage.fromMe &&
          !ticket.userId &&
          whatsapp.queues.length >= 1
        ) {
          await handleQueueLogic(
            contextPayload.whatsappId,
            processedMessage.body,
            ticket,
            contactPayload
          );
        }
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error({
      info: "Error handling message",
      err,
      messagePayload,
      contactPayload,
      contextPayload,
      mediaPayload
    });
  }
};

export const handleMessageAck = async (
  messageId: string,
  ack: MessageAck
): Promise<void> => {
  await new Promise(r => setTimeout(r, 500));

  try {
    const messageToUpdate = await Message.findByPk(messageId, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) {
      storePendingAck(messageId, ack);
      return;
    }

    const mergedAck = mergeAck(messageToUpdate.ack, ack);
    await messageToUpdate.update({ ack: mergedAck });

    const ticket = await Ticket.findByPk(messageToUpdate.ticketId, {
      attributes: ["id", "companyId"]
    });

    if (!ticket) {
      return;
    }

    emitToCompanyRooms(
      (ticket as any).companyId,
      [
        getCompanyTicketRoom(
          (ticket as any).companyId,
          messageToUpdate.ticketId.toString()
        )
      ],
      "appMessage",
      {
        action: "update",
        message: messageToUpdate
      }
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack: ${err}`);
  }
};
