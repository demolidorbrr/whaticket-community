import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import User from "../models/User";
import Setting from "../models/Setting";
import Company from "../models/Company";
import { runWithTenantContext } from "../libs/tenantContext";

interface TokenPayload {
  id: string;
  profile: string;
  companyId?: number | null;
  iat: number;
  exp: number;
}

const parseCompanyId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isLegacyGlobalTokenAllowed = async (): Promise<boolean> => {
  // Hardening multi-tenant:
  // token global legado so pode ser aceito quando ha no maximo uma empresa.
  const activeCompanies = await Company.count({
    where: { status: "active" }
  });

  return activeCompanies <= 1;
};

const isAuthApi = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;
  if (!token) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  try {
    const decoded = verify(token, authConfig.secret) as TokenPayload;

    const user = await User.findByPk(decoded.id, {
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

    runWithTenantContext({ companyId, profile: user.profile }, () => next());
    return;
  } catch (err) {
    const requestCompanyId =
      parseCompanyId(req.headers["x-company-id"]) ??
      parseCompanyId(req.body?.companyId);

    if (!requestCompanyId) {
      throw new AppError("ERR_COMPANY_REQUIRED", 400);
    }

    const keyByCompany = `userApiToken:${requestCompanyId}`;
    let setting = await Setting.findOne({
      where: { key: keyByCompany, value: token }
    });

    if (!setting) {
      const legacyGlobalToken = await Setting.findOne({
        where: { key: "userApiToken", value: token }
      });

      if (legacyGlobalToken && (await isLegacyGlobalTokenAllowed())) {
        setting = legacyGlobalToken;
      }
    }

    if (!setting) {
      throw new AppError(
        "Invalid token. We'll try to assign a new one on next request",
        403
      );
    }

    req.user = {
      id: "0",
      profile: "admin",
      companyId: requestCompanyId
    };

    runWithTenantContext(
      { companyId: requestCompanyId, profile: "admin" },
      () => next()
    );
    return;
  }
};

export default isAuthApi;
