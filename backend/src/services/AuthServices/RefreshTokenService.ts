import { verify } from "jsonwebtoken";
import { Response as Res } from "express";

import User from "../../models/User";
import AppError from "../../errors/AppError";
import ShowUserService from "../UserServices/ShowUserService";
import authConfig from "../../config/auth";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import EnsureCompanyIsActiveService from "../CompanyServices/EnsureCompanyIsActiveService";

interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
}

interface Response {
  user: User;
  newToken: string;
  refreshToken: string;
}

export const RefreshTokenService = async (
  res: Res,
  token: string
): Promise<Response> => {
  let decoded: RefreshTokenPayload;

  try {
    // Trata apenas refresh token invalido/expirado como sessao expirada.
    decoded = verify(token, authConfig.refreshSecret) as RefreshTokenPayload;
  } catch (err) {
    res.clearCookie("jrt", { path: "/" });
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const { id, tokenVersion } = decoded;

  const user = await ShowUserService(id);

  if (user.tokenVersion !== tokenVersion) {
    res.clearCookie("jrt", { path: "/" });
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  EnsureCompanyIsActiveService(user.company);

  const newToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  return { user, newToken, refreshToken };
};

