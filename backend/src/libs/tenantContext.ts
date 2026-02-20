import { AsyncLocalStorage } from "async_hooks";

export interface TenantContextData {
  companyId: number;
  profile: string;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContextData>();

export const runWithTenantContext = async <T>(
  tenantContext: TenantContextData,
  callback: () => Promise<T> | T
): Promise<T> => {
  return tenantContextStorage.run(tenantContext, callback);
};

export const getTenantContext = (): TenantContextData | undefined => {
  return tenantContextStorage.getStore();
};

