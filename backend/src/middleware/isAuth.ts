import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import { runWithTenantContext } from "../libs/tenantContext";
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

  try {
    const decoded = verify(token, authConfig.secret);
    const { id, profile, companyId } = decoded as TokenPayload;

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

    await runWithTenantContext(
      {
        companyId: resolvedCompanyId,
        profile
      },
      async () => {
        next();
      }
    );
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request",
      403
    );
  }
};

export default isAuth;

