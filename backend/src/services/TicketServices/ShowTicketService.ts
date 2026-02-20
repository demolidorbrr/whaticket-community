import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import User from "../../models/User";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";
import { literal } from "sequelize";

const ShowTicketService = async (id: string | number): Promise<Ticket> => {
  const ticket = await Ticket.findByPk(id, {
    attributes: {
      include: [
        [
          literal(
            "(SELECT MAX(`createdAt`) FROM `Messages` WHERE `Messages`.`ticketId` = `Ticket`.`id`)"
          ),
          "lastMessageAt"
        ],
        [
          literal(
            "(SELECT MAX(UNIX_TIMESTAMP(`createdAt`)) * 1000 FROM `Messages` WHERE `Messages`.`ticketId` = `Ticket`.`id`)"
          ),
          "lastMessageAtTs"
        ]
      ]
    },
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name", "number", "profilePicUrl"],
        include: ["extraInfo"]
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name", "color"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["name"]
      },
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "color"],
        through: { attributes: [] }
      }
    ]
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  return ticket;
};

export default ShowTicketService;
