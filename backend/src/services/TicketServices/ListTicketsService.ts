import { Op, fn, where, col, Filterable, Includeable, literal } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import ShowUserService from "../UserServices/ShowUserService";
import Whatsapp from "../../models/Whatsapp";
import Tag from "../../models/Tag";
import User from "../../models/User";

interface Request {
  searchParam?: string;
  pageNumber?: string;
  status?: string;
  date?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  queueIds: number[];
}

interface Response {
  tickets: Ticket[];
  count: number;
  hasMore: boolean;
}

const ListTicketsService = async ({
  searchParam = "",
  pageNumber = "1",
  queueIds,
  status,
  date,
  showAll,
  userId,
  withUnreadMessages
}: Request): Promise<Response> => {
  const user = await ShowUserService(userId);
  const userQueueIds = user.queues.map(queue => queue.id);

  const normalizedQueueIds =
    showAll === "true"
      ? Array.isArray(queueIds) && queueIds.length > 0
        ? queueIds
        : []
      : Array.isArray(queueIds) && queueIds.length > 0
        ? queueIds
        : userQueueIds;

  let whereCondition: Filterable["where"] =
    showAll === "true"
      ? {}
      : {
          [Op.or]: [
            { userId },
            { status: "pending" },
            { [Op.and]: [{ status: "open" }, { userId: null }] }
          ]
        };

  if (normalizedQueueIds.length > 0) {
    whereCondition = {
      ...whereCondition,
      queueId: { [Op.or]: [normalizedQueueIds, null] }
    };
  } else if (showAll !== "true") {
    whereCondition = {
      ...whereCondition,
      queueId: null
    };
  }
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      attributes: ["id", "name", "number", "profilePicUrl"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
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
  ];

  if (status === "group") {
    whereCondition = {
      ...whereCondition,
      status: { [Op.in]: ["open", "pending"] },
      isGroup: true
    };
  } else if (status) {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();
    const searchLike = `%${sanitizedSearchParam}%`;
    const escapedSearchLike =
      Ticket.sequelize?.escape(searchLike) ||
      `'${searchLike.replace(/'/g, "''")}'`;

    whereCondition = {
      ...whereCondition,
      [Op.or]: [
        literal(
          `LOWER(COALESCE(\`contact\`.\`name\`, '')) COLLATE utf8mb4_unicode_ci LIKE LOWER(${escapedSearchLike}) COLLATE utf8mb4_unicode_ci`
        ),
        literal(
          `LOWER(COALESCE(\`contact\`.\`number\`, '')) LIKE LOWER(${escapedSearchLike})`
        ),
        literal(
          `LOWER(COALESCE(\`Ticket\`.\`lastMessage\`, '')) COLLATE utf8mb4_unicode_ci LIKE LOWER(${escapedSearchLike}) COLLATE utf8mb4_unicode_ci`
        ),
        literal(
          `EXISTS (SELECT 1 FROM \`Messages\` AS \`SearchMessage\` WHERE \`SearchMessage\`.\`ticketId\` = \`Ticket\`.\`id\` AND LOWER(COALESCE(\`SearchMessage\`.\`body\`, '')) COLLATE utf8mb4_unicode_ci LIKE LOWER(${escapedSearchLike}) COLLATE utf8mb4_unicode_ci)`
        )
      ]
    };
  }

  if (date) {
    whereCondition = {
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      }
    };
  }

  if (withUnreadMessages === "true") {
    const unreadQueueFilter =
      userQueueIds.length > 0
        ? { queueId: { [Op.or]: [userQueueIds, null] } }
        : { queueId: null };

    whereCondition = {
      [Op.or]: [{ userId }, { status: "pending" }],
      ...unreadQueueFilter,
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  const limit = 40;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: whereCondition,
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
    include: includeCondition,
    distinct: true,
    subQuery: !searchParam,
    limit,
    offset,
    order: [["updatedAt", "DESC"]]
  });

  const hasMore = count > offset + tickets.length;

  return {
    tickets,
    count,
    hasMore
  };
};

export default ListTicketsService;
