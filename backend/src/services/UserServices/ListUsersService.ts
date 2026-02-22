import { Sequelize, Op } from "sequelize";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  searchParam?: string;
  pageNumber?: string | number;
  requesterProfile?: string;
}

interface Response {
  users: User[];
  count: number;
  hasMore: boolean;
}

const ListUsersService = async ({
  searchParam = "",
  pageNumber = "1",
  requesterProfile = "user"
}: Request): Promise<Response> => {
  const whereCondition: any = {
    [Op.or]: [
      {
        "$User.name$": Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("User.name")),
          "LIKE",
          `%${searchParam.toLowerCase()}%`
        )
      },
      { email: { [Op.like]: `%${searchParam.toLowerCase()}%` } }
    ]
  };

  if (requesterProfile !== "superadmin") {
    whereCondition.profile = {
      [Op.ne]: "superadmin"
    };
  }
  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: users } = await User.findAndCountAll({
    where: whereCondition,
    attributes: ["name", "id", "email", "profile", "companyId", "createdAt"],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "companyId"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "companyId"]
      }
    ]
  });

  users.forEach(user => {
    const companyId = (user as any).companyId;
    const queues = (user.queues || []).filter(
      queue => (queue as any).companyId === companyId
    );

    (user as any).setDataValue("queues", queues);

    const whatsapp = user.whatsapp;
    if (whatsapp && (whatsapp as any).companyId !== companyId) {
      (user as any).setDataValue("whatsapp", null);
    }
  });

  const hasMore = count > offset + users.length;

  return {
    users,
    count,
    hasMore
  };
};

export default ListUsersService;
