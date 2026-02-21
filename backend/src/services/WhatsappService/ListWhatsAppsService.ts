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
        attributes: ["id", "name", "color", "greetingMessage"]
      }
    ]
  });

  return whatsapps;
};

export default ListWhatsAppsService;
