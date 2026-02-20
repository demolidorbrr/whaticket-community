import Tag from "../../models/Tag";

const ListTagsService = async (): Promise<Tag[]> => {
  const tags = await Tag.findAll({
    order: [["name", "ASC"]]
  });

  return tags;
};

export default ListTagsService;
