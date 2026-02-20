import * as Yup from "yup";
import { Request, Response } from "express";

import AppError from "../errors/AppError";
import Plan from "../models/Plan";
import Company from "../models/Company";
import { isSuperAdminProfile } from "../helpers/CheckUserProfile";

const parseBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "enabled", "sim", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "disabled", "nao", "não", "no"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value > 0;
  }

  return fallback;
};

const ensureSuperAdmin = (profile: string): void => {
  if (!isSuperAdminProfile(profile)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

const buildPlanPayload = (
  source: Record<string, unknown>,
  partial = false
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  if (!partial || source.name !== undefined) {
    payload.name = String(source.name || "").trim();
  }

  if (!partial || source.usersLimit !== undefined) {
    payload.usersLimit = Number(source.usersLimit || 0);
  }

  if (!partial || source.connectionsLimit !== undefined) {
    payload.connectionsLimit = Number(source.connectionsLimit || 0);
  }

  if (!partial || source.queuesLimit !== undefined) {
    payload.queuesLimit = Number(source.queuesLimit || 0);
  }

  if (!partial || source.price !== undefined) {
    payload.price = Number(source.price || 0);
  }

  const booleanFields = [
    "campaignsEnabled",
    "schedulesEnabled",
    "internalChatEnabled",
    "apiEnabled",
    "kanbanEnabled",
    "openAiEnabled",
    "integrationsEnabled",
    "internalUse",
    "isActive"
  ];

  booleanFields.forEach(field => {
    if (!partial || source[field] !== undefined) {
      payload[field] = parseBoolean(source[field], true);
    }
  });

  if (!partial && source.internalUse === undefined) {
    payload.internalUse = false;
  }

  return payload;
};

const validatePlanPayload = async (
  payload: Record<string, unknown>,
  isUpdate = false
): Promise<void> => {
  const schema = Yup.object().shape({
    name: isUpdate ? Yup.string().min(2) : Yup.string().required().min(2),
    usersLimit: Yup.number().integer().min(0),
    connectionsLimit: Yup.number().integer().min(0),
    queuesLimit: Yup.number().integer().min(0),
    price: Yup.number().min(0)
  });

  await schema.validate(payload);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const plans = await Plan.findAll({
    order: [["id", "ASC"]]
  });

  return res.status(200).json(plans);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const payload = buildPlanPayload(req.body, false);
  await validatePlanPayload(payload);

  const planName = payload.name as string;
  const existingPlan = await Plan.findOne({ where: { name: planName } });

  if (existingPlan) {
    throw new AppError("ERR_PLAN_NAME_ALREADY_EXISTS", 409);
  }

  const plan = await Plan.create(payload);

  return res.status(201).json(plan);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const { planId } = req.params;
  const plan = await Plan.findByPk(planId);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  const payload = buildPlanPayload(req.body, true);
  await validatePlanPayload(payload, true);

  const nextPlanName = payload.name as string | undefined;

  if (nextPlanName && nextPlanName !== plan.name) {
    const existingPlan = await Plan.findOne({ where: { name: nextPlanName } });

    if (existingPlan) {
      throw new AppError("ERR_PLAN_NAME_ALREADY_EXISTS", 409);
    }
  }

  await plan.update(payload);

  return res.status(200).json(plan);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const { planId } = req.params;

  const plan = await Plan.findByPk(planId);

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  const companiesUsingPlan = await Company.count({
    where: { planId: Number(planId) }
  });

  if (companiesUsingPlan > 0) {
    throw new AppError("ERR_PLAN_HAS_COMPANIES", 409);
  }

  await plan.destroy();

  return res.status(200).json({ message: "Plan deleted" });
};

