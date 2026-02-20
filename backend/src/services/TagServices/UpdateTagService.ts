import * as Yup from "yup";
import { Op } from "sequelize";
import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";

interface Request {
  tagId: string | number;
  name?: string;
  color?: string;
}

const UpdateTagService = async ({ tagId, name, color }: Request): Promise<Tag> => {
  const schema = Yup.object().shape({
    name: Yup.string().min(2, "ERR_TAG_INVALID_NAME"),
    color: Yup.string()
      .nullable()
      .notRequired()
      .test("is-color", "ERR_TAG_INVALID_COLOR", value => {
        if (!value) return true;
        return /^#[0-9a-f]{3,6}$/i.test(value);
      })
  });

  try {
    await schema.validate({ name, color });
  } catch (err) {
    throw new AppError(err.message);
  }

  const tag = await Tag.findByPk(tagId);
  if (!tag) {
    throw new AppError("ERR_NO_TAG_FOUND", 404);
  }

  if (name) {
    const duplicated = await Tag.findOne({
      where: { name, id: { [Op.not]: tagId } }
    });
    if (duplicated) {
      throw new AppError("ERR_TAG_ALREADY_EXISTS");
    }
  }

  await tag.update({ name, color });

  return tag;
};

export default UpdateTagService;
