import { Op } from "sequelize";
import AppError from "../errors/AppError";
import { getTenantContext } from "../libs/tenantContext";

type ScopedOptions = {
  where?: Record<string, unknown>;
};

type TenantModelInstance = {
  companyId?: number;
};

const SUPERADMIN_PROFILE = "superadmin";

const hasCompanyConstraint = (where?: Record<string, unknown>): boolean => {
  if (!where) {
    return false;
  }

  return Object.prototype.hasOwnProperty.call(where, "companyId");
};

export const applyTenantScope = (options?: ScopedOptions): void => {
  const tenantContext = getTenantContext();

  if (!tenantContext || tenantContext.profile === SUPERADMIN_PROFILE) {
    return;
  }

  if (!options) {
    return;
  }

  if (!options.where) {
    options.where = { companyId: tenantContext.companyId };
    return;
  }

  if (hasCompanyConstraint(options.where)) {
    return;
  }

  options.where = {
    [Op.and]: [{ companyId: tenantContext.companyId }, options.where]
  };
};

export const applyTenantScopeToInstance = (
  instance: TenantModelInstance
): void => {
  if (instance.companyId) {
    return;
  }

  const tenantContext = getTenantContext();

  if (!tenantContext?.companyId) {
    throw new AppError("ERR_TENANT_CONTEXT_REQUIRED", 500);
  }

  instance.companyId = tenantContext.companyId;
};

export const applyTenantScopeToBulkInstances = (
  instances: TenantModelInstance[]
): void => {
  instances.forEach(instance => applyTenantScopeToInstance(instance));
};

