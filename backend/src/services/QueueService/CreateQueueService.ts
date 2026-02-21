import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Queue from "../../models/Queue";
import { getTenantContext } from "../../libs/tenantContext";
import ValidateCompanyPlanLimitService from "../CompanyServices/ValidateCompanyPlanLimitService";

interface QueueData {
  name: string;
  color: string;
  greetingMessage?: string;
  aiEnabled?: boolean;
  aiMode?: string;
  aiAutoReply?: boolean;
  aiPrompt?: string | null;
  aiWebhookUrl?: string | null;
}

const parseBoolean = (value: unknown, fallback = false): boolean => {
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

  return fallback;
};

const CreateQueueService = async (queueData: QueueData): Promise<Queue> => {
  const tenantContext = getTenantContext();

  if (!tenantContext?.companyId) {
    throw new AppError("ERR_TENANT_CONTEXT_REQUIRED", 500);
  }

  await ValidateCompanyPlanLimitService({
    companyId: tenantContext.companyId,
    resource: "queues"
  });

  const normalizedQueueData = {
    ...queueData,
    // Normalize booleans to avoid "true"/"false" strings being persisted as false.
    aiEnabled: parseBoolean(queueData.aiEnabled, false),
    aiAutoReply: parseBoolean(queueData.aiAutoReply, false),
    aiWebhookUrl: queueData.aiWebhookUrl?.trim() || null,
    aiPrompt: queueData.aiPrompt?.trim() || null
  };

  const { color, name, aiMode, aiWebhookUrl } = normalizedQueueData;

  const queueSchema = Yup.object().shape({
    name: Yup.string()
      .min(2, "ERR_QUEUE_INVALID_NAME")
      .required("ERR_QUEUE_INVALID_NAME")
      .test(
        "Check-unique-name",
        "ERR_QUEUE_NAME_ALREADY_EXISTS",
        async value => {
          if (value) {
            const queueWithSameName = await Queue.findOne({
              where: { name: value }
            });

            return !queueWithSameName;
          }
          return false;
        }
      ),
    color: Yup.string()
      .required("ERR_QUEUE_INVALID_COLOR")
      .test("Check-color", "ERR_QUEUE_INVALID_COLOR", async value => {
        if (value) {
          const colorTestRegex = /^#[0-9a-f]{3,6}$/i;
          return colorTestRegex.test(value);
        }
        return false;
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

  const queue = await Queue.create(normalizedQueueData);

  return queue;
};

export default CreateQueueService;

