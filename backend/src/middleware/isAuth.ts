import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import User from "../models/User";
import { runWithTenantContext } from "../libs/tenantContext";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId?: number;
  iat: number;
  exp: number;
}

const isAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(token, authConfig.secret);
    const { id, profile } = decoded as TokenPayload;

    const user = await User.findByPk(id, {
      attributes: ["id", "profile", "companyId"]
    });

    if (!user) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }

    const companyId = (user as any).companyId ?? null;
    if (user.profile !== "superadmin" && !companyId) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }

    req.user = {
      id: String(user.id),
      profile: user.profile,
      companyId
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request",
      403
    );
  }

  runWithTenantContext(
    // Injeta contexto do tenant para hooks globais de seguranca.
    { companyId: req.user.companyId ?? null, profile: req.user.profile },
    () => next()
  );
};

export default isAuth;
