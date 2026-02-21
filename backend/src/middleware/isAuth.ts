import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import { setTenantContext } from "../libs/tenantContext";
import Company from "../models/Company";
import Plan from "../models/Plan";
import User from "../models/User";
import EnsureCompanyIsActiveService from "../services/CompanyServices/EnsureCompanyIsActiveService";

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

  let decoded: TokenPayload;
  try {
    // Mantem o retry de refresh no frontend apenas para token invalido/expirado.
    decoded = verify(token, authConfig.secret) as TokenPayload;
  } catch (err) {
    throw new AppError("ERR_INVALID_TOKEN", 403);
  }

  const { id, profile, companyId } = decoded;

  let resolvedCompanyId = Number(companyId || 0);

  if (!resolvedCompanyId) {
    const user = await User.findByPk(id, {
      attributes: ["companyId"]
    });

    if (!user?.companyId) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }

    resolvedCompanyId = user.companyId;
  }

  if (profile !== "superadmin") {
    const company = await Company.findByPk(resolvedCompanyId, {
      include: [{ model: Plan, as: "plan" }]
    });

    EnsureCompanyIsActiveService(company);
  }

  req.user = {
    id,
    profile,
    companyId: resolvedCompanyId
  };

  // Garante escopo de tenant em toda cadeia async da request autenticada.
  setTenantContext({
    companyId: resolvedCompanyId,
    profile
  });

  next();
};

export default isAuth;

