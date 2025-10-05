export enum WhatsAppSessionStatus {
  OPENING = "OPENING",
  QRCODE = "qrcode",
  CONNECTED = "CONNECTED",
  PAIRING = "PAIRING",
  DISCONNECTED = "DISCONNECTED",
  DESTROYED = "DESTROYED"
}

export interface ProviderSession {
  id: number;
  name: string;
  status: WhatsAppSessionStatus;
  qrcode?: string;
}
