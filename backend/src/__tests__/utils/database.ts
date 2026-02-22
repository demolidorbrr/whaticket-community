import database from "../../database";

const truncate = async (): Promise<void> => {
  // MySQL pode bloquear TRUNCATE com FK; desativamos validacao apenas no escopo do reset de testes.
  await database.query("SET FOREIGN_KEY_CHECKS = 0");

  try {
    const tableNames = Object.values(database.models).map(model => {
      const tableName = model.getTableName();
      return typeof tableName === "string" ? tableName : tableName.tableName;
    });

    for (const tableName of tableNames) {
      await database.getQueryInterface().bulkDelete(tableName, {}, {});
    }
  } finally {
    await database.query("SET FOREIGN_KEY_CHECKS = 1");
  }
};

const disconnect = async (): Promise<void> => {
  return database.connectionManager.close();
};

export { truncate, disconnect };
