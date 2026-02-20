import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Plan from "../../models/Plan";

const EnsureCompanyIsActiveService = (company?: Company | null): void => {
  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 403);
  }

  if (company.status !== "active") {
    throw new AppError("ERR_COMPANY_INACTIVE", 403);
  }

  if (company.dueDate && new Date(company.dueDate) < new Date()) {
    throw new AppError("ERR_COMPANY_EXPIRED", 403);
  }

  const plan = company.plan as Plan | undefined;
  if (plan && plan.isActive === false) {
    throw new AppError("ERR_PLAN_INACTIVE", 403);
  }
};

export default EnsureCompanyIsActiveService;

