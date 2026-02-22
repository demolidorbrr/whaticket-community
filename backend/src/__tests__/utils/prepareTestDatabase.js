const mysql = require("mysql2/promise");

const sourceDatabaseName = process.env.DB_NAME || "whaticket";
const testDatabaseName =
  process.env.DB_TEST_NAME || `${sourceDatabaseName}_test`;
const mode = process.argv[2] || "setup";

const escapeIdentifier = value => `\`${String(value).replace(/`/g, "``")}\``;

const getConnectionConfig = () => ({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  multipleStatements: true
});

const copySourceSchemaToTestDatabase = async connection => {
  const [tableRows] = await connection.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME ASC
    `,
    [sourceDatabaseName]
  );

  await connection.query(`USE ${escapeIdentifier(testDatabaseName)}`);
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");

  try {
    for (const row of tableRows) {
      const tableName = row.TABLE_NAME;
      const [createTableRows] = await connection.query(
        `SHOW CREATE TABLE ${escapeIdentifier(sourceDatabaseName)}.${escapeIdentifier(tableName)}`
      );
      const createTableSql = createTableRows[0]["Create Table"];
      await connection.query(createTableSql);
    }
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }
};

const setup = async () => {
  if (sourceDatabaseName === testDatabaseName) {
    throw new Error(
      `DB_TEST_NAME (${testDatabaseName}) nao pode ser igual ao DB_NAME (${sourceDatabaseName}).`
    );
  }

  const connection = await mysql.createConnection(getConnectionConfig());

  try {
    // Sempre recria do zero para impedir vazamento de estado entre execucoes.
    await connection.query(
      `DROP DATABASE IF EXISTS ${escapeIdentifier(testDatabaseName)}`
    );
    await connection.query(
      `CREATE DATABASE ${escapeIdentifier(testDatabaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`
    );
    await copySourceSchemaToTestDatabase(connection);
    console.log(
      `[tests] banco de teste preparado: ${testDatabaseName} (origem: ${sourceDatabaseName})`
    );
  } finally {
    await connection.end();
  }
};

const cleanup = async () => {
  const connection = await mysql.createConnection(getConnectionConfig());

  try {
    await connection.query(
      `DROP DATABASE IF EXISTS ${escapeIdentifier(testDatabaseName)}`
    );
    console.log(`[tests] banco de teste removido: ${testDatabaseName}`);
  } finally {
    await connection.end();
  }
};

(async () => {
  if (mode === "setup") {
    await setup();
    return;
  }

  if (mode === "cleanup") {
    await cleanup();
    return;
  }

  throw new Error(`Modo invalido: ${mode}`);
})().catch(error => {
  console.error("[tests] falha ao preparar banco de teste:", error.message);
  process.exit(1);
});
