import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await Promise.all([
      queryInterface.addColumn("Tickets", "leadScore", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }),
      queryInterface.addColumn("Tickets", "channel", {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "whatsapp"
      }),
      queryInterface.addColumn("Tickets", "slaDueAt", {
        type: DataTypes.DATE(6),
        allowNull: true
      }),
      queryInterface.addColumn("Tickets", "firstHumanResponseAt", {
        type: DataTypes.DATE(6),
        allowNull: true
      }),
      queryInterface.addColumn("Tickets", "resolvedAt", {
        type: DataTypes.DATE(6),
        allowNull: true
      })
    ]);

    await queryInterface.createTable("Tags", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      color: {
        type: DataTypes.STRING,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      }
    });

    await queryInterface.createTable("TicketTags", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      tagId: {
        type: DataTypes.INTEGER,
        references: { model: "Tags", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      createdAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      }
    });

    await queryInterface.addConstraint(
      "TicketTags",
      ["ticketId", "tagId"],
      {
        type: "unique",
        name: "TicketTags_ticketId_tagId_unique"
      }
    );

    await queryInterface.createTable("TicketEvents", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      queueId: {
        type: DataTypes.INTEGER,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      userId: {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      eventType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "system"
      },
      payload: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      }
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("TicketEvents");
    await queryInterface.dropTable("TicketTags");
    await queryInterface.dropTable("Tags");

    await Promise.all([
      queryInterface.removeColumn("Tickets", "resolvedAt"),
      queryInterface.removeColumn("Tickets", "firstHumanResponseAt"),
      queryInterface.removeColumn("Tickets", "slaDueAt"),
      queryInterface.removeColumn("Tickets", "channel"),
      queryInterface.removeColumn("Tickets", "leadScore")
    ]);
  }
};
