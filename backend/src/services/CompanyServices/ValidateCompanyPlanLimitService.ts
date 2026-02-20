import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import EnsureCompanyIsActiveService from "./EnsureCompanyIsActiveService";

type CompanyLimitResource = "users" | "queues" | "connections";

interface Request {
  companyId: number;
  resource: CompanyLimitResource;
}

const getPlanLimit = (plan: Plan, resource: CompanyLimitResource): number => {
  if (resource === "users") return Number(plan.usersLimit || 0);
  if (resource === "queues") return Number(plan.queuesLimit || 0);

  return Number(plan.connectionsLimit || 0);
};

const getCurrentUsage = async (
  companyId: number,
  resource: CompanyLimitResource
): Promise<number> => {
  if (resource === "users") {
    return User.count({ where: { companyId } });
  }

  if (resource === "queues") {
    return Queue.count({ where: { companyId } });
  }

  return Whatsapp.count({ where: { companyId } });
};

const getErrorByResource = (resource: CompanyLimitResource): string => {
  if (resource === "users") return "ERR_PLAN_USER_LIMIT_REACHED";
  if (resource === "queues") return "ERR_PLAN_QUEUE_LIMIT_REACHED";

  return "ERR_PLAN_CONNECTION_LIMIT_REACHED";
};

const ValidateCompanyPlanLimitService = async ({
  companyId,
  resource
}: Request): Promise<void> => {
  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 403);
  }

  EnsureCompanyIsActiveService(company);

  const plan = company.plan as Plan | undefined;

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 403);
  }

  const limit = getPlanLimit(plan, resource);

  // `0` or negative means blocked for that resource.
  if (limit <= 0) {
    throw new AppError(getErrorByResource(resource), 403);
  }

  const currentUsage = await getCurrentUsage(companyId, resource);

  if (currentUsage >= limit) {
    throw new AppError(getErrorByResource(resource), 403);
  }
};

export default ValidateCompanyPlanLimitService;

