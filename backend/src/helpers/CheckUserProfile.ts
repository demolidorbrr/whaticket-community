export const isAdminProfile = (profile: string): boolean => {
  return profile === "admin" || profile === "superadmin";
};

export const isSuperAdminProfile = (profile: string): boolean => {
  return profile === "superadmin";
};

