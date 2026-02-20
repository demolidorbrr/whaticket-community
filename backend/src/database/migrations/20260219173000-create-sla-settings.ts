import { QueryInterface, QueryTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const defaults = [
      { key: "slaEscalationEnabled", value: "disabled" },
      { key: "slaReplyMinutes", value: "30" },
      { key: "slaEscalationQueueId", value: "" }
    ];

    for (const item of defaults) {
      const existing: any = await queryInterface.sequelize.query(
        `SELECT \`key\` FROM \`Settings\` WHERE \`key\` = :key LIMIT 1;`,
        {
          replacements: { key: item.key },
          type: QueryTypes.SELECT
        }
      );

      if (!existing || existing.length === 0) {
        await queryInterface.bulkInsert("Settings", [
          {
            key: item.key,
            value: item.value,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]);
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.bulkDelete("Settings", {
      key: ["slaEscalationEnabled", "slaReplyMinutes", "slaEscalationQueueId"]
    });
  }
};
