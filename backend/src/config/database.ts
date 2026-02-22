require("../bootstrap");

const isTestEnv = process.env.NODE_ENV === "test";
const defaultDatabaseName = process.env.DB_NAME || "whaticket";

// Em testes usamos um banco dedicado para nao tocar dados da aplicacao.
const databaseName = isTestEnv
  ? process.env.DB_TEST_NAME || `${defaultDatabaseName}_test`
  : defaultDatabaseName;

module.exports = {
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_bin"
  },
  dialect: process.env.DB_DIALECT || "mysql",
  timezone: "-03:00",
  host: process.env.DB_HOST,
  database: databaseName,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  logging: false
};
