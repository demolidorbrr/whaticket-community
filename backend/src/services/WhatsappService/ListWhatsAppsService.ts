import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import { getTenantContext } from "../../libs/tenantContext";

const ListWhatsAppsService = async (): Promise<Whatsapp[]> => {
  const tenantContext = getTenantContext();
  // Em requests autenticadas, sempre isola pela empresa do token.
  const where = tenantContext?.companyId
    ? { companyId: tenantContext.companyId }
    : undefined;

  const whatsapps = await Whatsapp.findAll({
    where,
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
