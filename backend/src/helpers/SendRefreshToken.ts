import { Response } from "express";

export const SendRefreshToken = (res: Response, token: string): void => {
  const isSecure = String(process.env.BACKEND_URL || "").startsWith("https://");

  // Define opcoes explicitas para evitar comportamento inconsistente do cookie entre ambientes.
  res.cookie("jrt", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/"
  });
};
