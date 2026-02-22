import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";

const ListWhatsAppsService = async (): Promise<Whatsapp[]> => {
  const whatsapps = await Whatsapp.findAll({
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage", "companyId"]
      }
    ]
  });

  whatsapps.forEach(whatsapp => {
    const companyId = (whatsapp as any).companyId;
    const queues = (whatsapp.queues || []).filter(
      queue => (queue as any).companyId === companyId
    );

    (whatsapp as any).setDataValue("queues", queues);
  });

  return whatsapps;
};

export default ListWhatsAppsService;
