import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";

const DeleteTagService = async (tagId: string | number): Promise<void> => {
  const tag = await Tag.findByPk(tagId);
  if (!tag) {
    throw new AppError("ERR_NO_TAG_FOUND", 404);
  }

  await tag.destroy();
};

export default DeleteTagService;
