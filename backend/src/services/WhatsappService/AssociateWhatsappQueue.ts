import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AppError from "../../errors/AppError";

const AssociateWhatsappQueue = async (
  whatsapp: Whatsapp,
  queueIds: number[]
): Promise<void> => {
  const companyId = (whatsapp as any).companyId as number | undefined;
  if (!companyId) {
    throw new AppError("ERR_COMPANY_REQUIRED", 400);
  }

  const normalizedQueueIds = [...new Set((queueIds || []).map(id => Number(id)))];

  if (normalizedQueueIds.length > 0) {
    const queues = await Queue.findAll({
      where: { id: normalizedQueueIds, companyId },
      attributes: ["id"]
    });

    if (queues.length !== normalizedQueueIds.length) {
      throw new AppError("ERR_NO_QUEUE_FOUND", 404);
    }
  }

  await whatsapp.$set("queues", normalizedQueueIds);

  await whatsapp.reload();
};

export default AssociateWhatsappQueue;
