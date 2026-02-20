import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Queues", "aiEnabled", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }),
      queryInterface.addColumn("Queues", "aiMode", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "triage"
      }),
      queryInterface.addColumn("Queues", "aiAutoReply", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }),
      queryInterface.addColumn("Queues", "aiPrompt", {
        type: DataTypes.TEXT,
        allowNull: true
      }),
      queryInterface.addColumn("Queues", "aiWebhookUrl", {
        type: DataTypes.STRING,
        allowNull: true
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Queues", "aiWebhookUrl"),
      queryInterface.removeColumn("Queues", "aiPrompt"),
      queryInterface.removeColumn("Queues", "aiAutoReply"),
      queryInterface.removeColumn("Queues", "aiMode"),
      queryInterface.removeColumn("Queues", "aiEnabled")
    ]);
  }
};
