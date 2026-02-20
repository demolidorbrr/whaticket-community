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
  aiPrompt?: string;
  aiWebhookUrl?: string;
}

const UpdateQueueService = async (
  queueId: number | string,
  queueData: QueueData
): Promise<Queue> => {
  const normalizedQueueData = {
    ...queueData,
    aiWebhookUrl: queueData.aiWebhookUrl?.trim() || null,
    aiPrompt: queueData.aiPrompt?.trim() || null
  };

  const { color, name, aiMode, aiWebhookUrl } = normalizedQueueData;

  const queueSchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_QUEUE_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_QUEUE_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const queueWithSameName = await Queue.findOne({
              where: { name: value, id: { [Op.not]: queueId } }
            });

            return !queueWithSameName;
          }
          return true;
        }
      ),
    color: Yup.string()
      .required("ERR_QUEUE_INVALID_COLOR")
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

  await queue.update(normalizedQueueData);

  return queue;
};

export default UpdateQueueService;
