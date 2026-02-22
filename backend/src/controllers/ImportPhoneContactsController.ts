import { Request, Response } from "express";
import fs from "fs/promises";
import AppError from "../errors/AppError";
import ImportContactsCsvService from "../services/ContactServices/ImportContactsCsvService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  if (!req.file) {
    throw new AppError("ERR_CONTACTS_CSV_REQUIRED", 400);
  }

  if (!req.user.companyId) {
    throw new AppError("ERR_NO_COMPANY_CONTEXT", 400);
  }

  try {
    const result = await ImportContactsCsvService({
      filePath: req.file.path,
      companyId: req.user.companyId
    });
    return res.status(200).json(result);
  } finally {
    await fs.unlink(req.file.path).catch(() => undefined);
  }
};
