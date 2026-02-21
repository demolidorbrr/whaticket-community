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

  // Security hardening: always intersect existing filters with tenant company.
  // This blocks explicit/implicit attempts to bypass tenant isolation.
  options.where = {
    [Op.and]: [{ companyId: tenantContext.companyId }, options.where]
  };
};

export const applyTenantScopeToInstance = (
  instance: TenantModelInstance
): void => {
  const tenantContext = getTenantContext();

  if (instance.companyId) {
    if (
      tenantContext &&
      tenantContext.profile !== SUPERADMIN_PROFILE &&
      instance.companyId !== tenantContext.companyId
    ) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }

    return;
  }

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

