import { Op } from "sequelize";
import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import ShowQueueService from "./ShowQueueService";

interface QueueData {
  name?: string;
  color?: string;
  greetingMessage?: string;
  aiEnabled?: boolean;
  aiMode?: string;
  aiAutoReply?: boolean;
  aiPrompt?: string | null;
  aiWebhookUrl?: string | null;
}

const parseOptionalBoolean = (
  value: unknown
): boolean | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "enabled", "sim", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "disabled", "nao", "não", "no"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value > 0;
  }

  return undefined;
};

const UpdateQueueService = async (
  queueId: number | string,
  queueData: QueueData
): Promise<Queue> => {
  const normalizedAiEnabled = parseOptionalBoolean(queueData.aiEnabled);
  const normalizedAiAutoReply = parseOptionalBoolean(queueData.aiAutoReply);

  const normalizedQueueData: QueueData = {
    ...queueData,
    // Normalize booleans to avoid "true"/"false" strings being persisted as false.
    aiEnabled: normalizedAiEnabled,
    aiAutoReply:
      normalizedAiEnabled === false
        ? false
        : normalizedAiAutoReply
  };

  if (Object.prototype.hasOwnProperty.call(queueData, "aiWebhookUrl")) {
    normalizedQueueData.aiWebhookUrl = queueData.aiWebhookUrl?.trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(queueData, "aiPrompt")) {
    normalizedQueueData.aiPrompt = queueData.aiPrompt?.trim() || null;
  }

  const { color, name, aiMode, aiWebhookUrl } = normalizedQueueData;

  const queueSchema = Yup.object().shape({
    name: Yup.string().min(2, "ERR_QUEUE_INVALID_NAME"),
    color: Yup.string()
      .test("Check-color", "ERR_QUEUE_INVALID_COLOR", async value => {
        if (value) {
          const colorTestRegex = /^#[0-9a-f]{3,6}$/i;
          return colorTestRegex.test(value);
        }
        return true;
      }),
    aiMode: Yup.string()
      .nullable()
      .notRequired()
      .test("Check-ai-mode", "ERR_QUEUE_INVALID_AI_MODE", async value => {
        if (value) {
          return ["triage", "initial_reply", "hybrid"].includes(value);
        }
        return true;
      }),
    aiWebhookUrl: Yup.string()
      .trim()
      .url("ERR_QUEUE_INVALID_AI_WEBHOOK_URL")
      .nullable()
      .notRequired()
  });

  try {
    await queueSchema.validate({ color, name, aiMode, aiWebhookUrl });
  } catch (err) {
    throw new AppError(err.message);
  }

  const queue = await ShowQueueService(queueId);
  const companyId = (queue as any).companyId as number | undefined;

  if (!companyId) {
    throw new AppError("ERR_COMPANY_REQUIRED", 400);
  }

  if (name) {
    const queueWithSameName = await Queue.findOne({
      where: { name, companyId, id: { [Op.not]: queueId } }
    });

    if (queueWithSameName) {
      throw new AppError("ERR_QUEUE_NAME_ALREADY_EXISTS");
    }
  }

  await queue.update(normalizedQueueData);

  return queue;
};

export default UpdateQueueService;
