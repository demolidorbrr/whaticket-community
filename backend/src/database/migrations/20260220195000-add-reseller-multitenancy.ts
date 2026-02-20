import { DataTypes, QueryInterface, QueryTypes } from "sequelize";

type IndexField = {
  attribute?: string;
  name?: string;
};

type TableIndex = {
  name: string;
  unique?: boolean;
  fields?: IndexField[];
};

const DEFAULT_PLAN_ID = 1;
const DEFAULT_COMPANY_ID = 1;

const removeUniqueIndexByColumns = async (
  queryInterface: QueryInterface,
  tableName: string,
  columns: string[]
): Promise<void> => {
  const indexes = (await queryInterface.showIndex(tableName)) as TableIndex[];

  for (const index of indexes) {
    if (!index.unique || !Array.isArray(index.fields)) {
      continue;
    }

    const indexColumns = index.fields
      .map(field => field.attribute || field.name)
      .filter(Boolean) as string[];

    if (
      indexColumns.length === columns.length &&
      columns.every((column, idx) => indexColumns[idx] === column)
    ) {
      await queryInterface.removeIndex(tableName, index.name);
    }
  }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Plans", {
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
      usersLimit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 20
      },
      connectionsLimit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 20
      },
      queuesLimit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 20
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      campaignsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      schedulesEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      internalChatEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      apiEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      kanbanEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      openAiEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      integrationsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      internalUse: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.bulkInsert("Plans", [
      {
        id: DEFAULT_PLAN_ID,
        name: "Plano Padrao",
        usersLimit: 200,
        connectionsLimit: 200,
        queuesLimit: 200,
        price: 0,
        campaignsEnabled: true,
        schedulesEnabled: true,
        internalChatEnabled: true,
        apiEnabled: true,
        kanbanEnabled: true,
        openAiEnabled: true,
        integrationsEnabled: true,
        internalUse: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    await queryInterface.createTable("Companies", {
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
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "active"
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: true
      },
      planId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Plans",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.bulkInsert("Companies", [
      {
        id: DEFAULT_COMPANY_ID,
        name: "Empresa Principal",
        status: "active",
        dueDate: null,
        planId: DEFAULT_PLAN_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    const tenantTables = [
      "Users",
      "Queues",
      "Whatsapps",
      "Contacts",
      "Tickets",
      "QuickAnswers",
      "Tags",
      "Schedules"
    ];

    for (const tableName of tenantTables) {
      await queryInterface.addColumn(tableName, "companyId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Companies",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      });

      await queryInterface.sequelize.query(
        `UPDATE \`${tableName}\` SET \`companyId\` = :companyId WHERE \`companyId\` IS NULL;`,
        {
          replacements: { companyId: DEFAULT_COMPANY_ID },
          type: QueryTypes.UPDATE
        }
      );

      await queryInterface.changeColumn(tableName, "companyId", {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Companies",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      });

      await queryInterface.addIndex(tableName, ["companyId"], {
        name: `${tableName}_companyId_index`
      });
    }

    await removeUniqueIndexByColumns(queryInterface, "Contacts", ["number"]);
    await removeUniqueIndexByColumns(queryInterface, "Contacts", ["lid"]);
    await removeUniqueIndexByColumns(queryInterface, "Queues", ["name"]);
    await removeUniqueIndexByColumns(queryInterface, "Queues", ["color"]);
    await removeUniqueIndexByColumns(queryInterface, "Whatsapps", ["name"]);
    await removeUniqueIndexByColumns(queryInterface, "Tags", ["name"]);

    await queryInterface.addIndex("Contacts", ["companyId", "number"], {
      unique: true,
      name: "Contacts_companyId_number_unique"
    });

    await queryInterface.addIndex("Contacts", ["companyId", "lid"], {
      unique: true,
      name: "Contacts_companyId_lid_unique"
    });

    await queryInterface.addIndex("Queues", ["companyId", "name"], {
      unique: true,
      name: "Queues_companyId_name_unique"
    });

    await queryInterface.addIndex("Whatsapps", ["companyId", "name"], {
      unique: true,
      name: "Whatsapps_companyId_name_unique"
    });

    await queryInterface.addIndex("Tags", ["companyId", "name"], {
      unique: true,
      name: "Tags_companyId_name_unique"
    });

    const existingSuperAdmin = (await queryInterface.sequelize.query(
      "SELECT id FROM `Users` WHERE `profile` = 'superadmin' LIMIT 1;",
      { type: QueryTypes.SELECT }
    )) as Array<{ id: number }>;

    if (!existingSuperAdmin.length) {
      const firstUser = (await queryInterface.sequelize.query(
        "SELECT id FROM `Users` ORDER BY id ASC LIMIT 1;",
        { type: QueryTypes.SELECT }
      )) as Array<{ id: number }>;

      if (firstUser.length) {
        await queryInterface.sequelize.query(
          "UPDATE `Users` SET `profile` = 'superadmin' WHERE `id` = :id;",
          {
            replacements: { id: firstUser[0].id },
            type: QueryTypes.UPDATE
          }
        );
      }
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("Tags", "Tags_companyId_name_unique");
    await queryInterface.removeIndex("Whatsapps", "Whatsapps_companyId_name_unique");
    await queryInterface.removeIndex("Queues", "Queues_companyId_name_unique");
    await queryInterface.removeIndex("Contacts", "Contacts_companyId_lid_unique");
    await queryInterface.removeIndex("Contacts", "Contacts_companyId_number_unique");

    await queryInterface.addIndex("Tags", ["name"], {
      unique: true,
      name: "Tags_name_unique"
    });

    await queryInterface.addIndex("Whatsapps", ["name"], {
      unique: true,
      name: "Whatsapps_name_unique"
    });

    await queryInterface.addIndex("Queues", ["name"], {
      unique: true,
      name: "Queues_name_unique"
    });

    await queryInterface.addIndex("Queues", ["color"], {
      unique: true,
      name: "Queues_color_unique"
    });

    await queryInterface.addIndex("Contacts", ["number"], {
      unique: true,
      name: "Contacts_number_unique"
    });

    await queryInterface.addIndex("Contacts", ["lid"], {
      unique: true,
      name: "Contacts_lid_unique"
    });

    const tenantTables = [
      "Users",
      "Queues",
      "Whatsapps",
      "Contacts",
      "Tickets",
      "QuickAnswers",
      "Tags",
      "Schedules"
    ];

    for (const tableName of tenantTables) {
      await queryInterface.removeIndex(tableName, `${tableName}_companyId_index`);
      await queryInterface.removeColumn(tableName, "companyId");
    }

    await queryInterface.dropTable("Companies");
    await queryInterface.dropTable("Plans");
  }
};

