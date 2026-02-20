export default {
  secret: process.env.JWT_SECRET || "mysecret",
  expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  refreshSecret: process.env.JWT_REFRESH_SECRET || "myanothersecret",
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d"
};
