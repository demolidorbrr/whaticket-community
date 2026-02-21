import AppError from "../../errors/AppError";
import CheckContactOpenTickets from "../../helpers/CheckContactOpenTickets";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import ShowContactService from "../ContactServices/ShowContactService";

interface Request {
  contactId: number;
  status: string;
  userId: number;
  queueId?: number;
}

const CreateTicketService = async ({
  contactId,
  status,
  userId,
  queueId
}: Request): Promise<Ticket> => {
  const defaultWhatsapp = await GetDefaultWhatsApp(userId);

  await CheckContactOpenTickets(contactId, defaultWhatsapp.id);

  const contact = await ShowContactService(contactId);
  const { isGroup } = contact;

  if (!defaultWhatsapp.companyId || contact.companyId !== defaultWhatsapp.companyId) {
    // Impede vincular ticket a contato/whatsapp de empresas diferentes.
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findByPk(userId, { include: ["queues"] });

  if (!user || user.companyId !== defaultWhatsapp.companyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (queueId === undefined || queueId === null) {
    queueId = user?.queues.length === 1 ? user.queues[0].id : undefined;
  } else {
    const queueExists = await Queue.count({
      where: { id: queueId, companyId: defaultWhatsapp.companyId }
    });

    if (!queueExists) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  const { id }: Ticket = await defaultWhatsapp.$create("ticket", {
    contactId,
    status,
    isGroup,
    userId,
    queueId
  });

  const ticket = await Ticket.findByPk(id, { include: ["contact"] });

  if (!ticket) {
    throw new AppError("ERR_CREATING_TICKET");
  }

  const ticketWhatsapp = await Whatsapp.findByPk(ticket.whatsappId, {
    attributes: ["companyId"]
  });

  if (!ticketWhatsapp || ticketWhatsapp.companyId !== defaultWhatsapp.companyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  return ticket;
};

export default CreateTicketService;
