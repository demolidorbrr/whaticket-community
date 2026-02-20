import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";

interface Request {
  name: string;
  color?: string;
}

const CreateTagService = async ({ name, color }: Request): Promise<Tag> => {
  const schema = Yup.object().shape({
    name: Yup.string()
      .required("ERR_TAG_INVALID_NAME")
      .min(2, "ERR_TAG_INVALID_NAME"),
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

  const existing = await Tag.findOne({ where: { name } });
  if (existing) {
    throw new AppError("ERR_TAG_ALREADY_EXISTS");
  }

  const tag = await Tag.create({ name, color });

  return tag;
};

export default CreateTagService;
