import { Op } from "sequelize";
import { getTenantContext } from "./tenantContext";

type TenantModel = any;

const hasCompanyColumn = (model: TenantModel): boolean => {
  return !!(model as any)?.rawAttributes?.companyId;
};

const getScopedCompanyId = (): number | null => {
  const context = getTenantContext();
  if (!context) return null;
  if (context.profile === "superadmin") return null;

  const { companyId } = context;
  if (companyId === null || companyId === undefined) return null;

  return companyId;
};

const addCompanyIdToWhere = (options: any): void => {
  // Aplica isolamento por tenant apenas para usuarios nao-superadmin.
  const companyId = getScopedCompanyId();
  if (companyId === null || !options) {
    return;
  }

  const existingWhere = options.where;

  if (!existingWhere) {
    options.where = { companyId };
    return;
  }

  if (Object.prototype.hasOwnProperty.call(existingWhere, "companyId")) {
    return;
  }

  options.where = {
    [Op.and]: [{ companyId }, existingWhere]
  };
};

const applyCompanyIdOnCreate = (instance: any): void => {
  // Garante companyId em inserts originados de requisicoes autenticadas.
  const context = getTenantContext();
  if (!context || context.companyId === null || context.companyId === undefined) {
    return;
  }

  if (!(instance as any)?.rawAttributes?.companyId) {
    return;
  }

  if (!instance.getDataValue?.("companyId")) {
    instance.setDataValue?.("companyId", context.companyId);
  }
};

export const registerTenantHooks = (models: TenantModel[]): void => {
  models.forEach(model => {
    if (!hasCompanyColumn(model)) {
      return;
    }

    model.addHook("beforeFind", (options: any) => {
      addCompanyIdToWhere(options);
    });

    model.addHook("beforeCount", (options: any) => {
      addCompanyIdToWhere(options);
    });

    model.addHook("beforeBulkUpdate", (options: any) => {
      addCompanyIdToWhere(options);
    });

    model.addHook("beforeBulkDestroy", (options: any) => {
      addCompanyIdToWhere(options);
    });

    model.addHook("beforeCreate", (instance: any) => {
      applyCompanyIdOnCreate(instance);
    });

    model.addHook("beforeBulkCreate", (instances: any[]) => {
      instances.forEach((instance: any) => {
        applyCompanyIdOnCreate(instance);
      });
    });
  });
};
