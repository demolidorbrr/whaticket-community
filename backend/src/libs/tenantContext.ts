import { AsyncLocalStorage } from "async_hooks";

export interface TenantRequestContext {
  companyId?: number | null;
  profile?: string;
}

const tenantContextStorage = new AsyncLocalStorage<TenantRequestContext>();

export const runWithTenantContext = <T>(
  context: TenantRequestContext,
  callback: () => T
): T => {
  return tenantContextStorage.run(context, callback);
};

export const getTenantContext = (): TenantRequestContext | undefined => {
  return tenantContextStorage.getStore();
};
