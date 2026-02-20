import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";
import ListTagsService from "../services/TagServices/ListTagsService";
import CreateTagService from "../services/TagServices/CreateTagService";
import UpdateTagService from "../services/TagServices/UpdateTagService";
import DeleteTagService from "../services/TagServices/DeleteTagService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const tags = await ListTagsService();

  return res.status(200).json(tags);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { name, color } = req.body;
  const tag = await CreateTagService({ name, color });

  const io = getIO();
  io.emit("tag", { action: "create", tag });

  return res.status(201).json(tag);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { tagId } = req.params;
  const { name, color } = req.body;

  const tag = await UpdateTagService({ tagId, name, color });

  const io = getIO();
  io.emit("tag", { action: "update", tag });

  return res.status(200).json(tag);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { tagId } = req.params;
  await DeleteTagService(tagId);

  const io = getIO();
  io.emit("tag", { action: "delete", tagId: Number(tagId) });

  return res.status(200).json({ message: "Tag deleted" });
};
