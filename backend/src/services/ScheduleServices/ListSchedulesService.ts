import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import User from "../../models/User";

interface Request {
  status?: string;
}

const ListSchedulesService = async ({ status }: Request): Promise<Schedule[]> => {
  const whereCondition = status ? { status } : undefined;

  const schedules = await Schedule.findAll({
    where: whereCondition,
    include: [
      {
        model: Contact,
        as: "contact",
        attributes: ["id", "name", "number", "profilePicUrl"]
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "name"]
      }
    ],
    order: [
      ["status", "ASC"],
      ["sendAt", "ASC"]
    ]
  });

  return schedules;
};

export default ListSchedulesService;
