export interface ProviderMediaInput {
  filename: string;
  mimetype: string;
  path?: string;
  data?: Buffer;
}

export interface ProviderMediaOutput {
  filename: string;
  mimetype: string;
  data: string; // base64
}

export interface MediaMessageOptions {
  caption?: string;
  sendAudioAsVoice?: boolean;
  sendMediaAsDocument?: boolean;
}
