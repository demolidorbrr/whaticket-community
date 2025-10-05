export enum MessageType {
  CHAT = "chat",
  AUDIO = "audio",
  PTT = "ptt",
  VIDEO = "video",
  IMAGE = "image",
  DOCUMENT = "document",
  VCARD = "vcard",
  STICKER = "sticker",
  LOCATION = "location"
}

export enum MessageAck {
  PENDING = 0,
  SERVER = 1,
  DEVICE = 2,
  READ = 3,
  PLAYED = 4
}

export interface ProviderMessage {
  id: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
  type: MessageType;
  timestamp: number;
  from: string;
  to: string;
  hasQuotedMsg?: boolean;
  ack?: MessageAck;
  delete: (param: boolean) => Promise<void>;
}

export interface ProviderQuotedMessage {
  id: string;
  body: string;
  fromMe: boolean;
}
