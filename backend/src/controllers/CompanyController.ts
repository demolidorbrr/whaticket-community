import * as Yup from "yup";
import { Request, Response } from "express";

import AppError from "../errors/AppError";
import Company from "../models/Company";
import Plan from "../models/Plan";
import User from "../models/User";
import { isSuperAdminProfile } from "../helpers/CheckUserProfile";
import CreateUserService from "../services/UserServices/CreateUserService";

const ensureSuperAdmin = (profile: string): void => {
  if (!isSuperAdminProfile(profile)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

const parseDate = (value?: string | null): Date | null => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new AppError("ERR_COMPANY_INVALID_DUE_DATE", 400);
  }

  return parsedDate;
};

const parseStatus = (value?: string): string => {
  if (!value) {
    return "active";
  }

  const normalized = value.trim().toLowerCase();

  if (["active", "inactive"].includes(normalized)) {
    return normalized;
  }

  throw new AppError("ERR_COMPANY_INVALID_STATUS", 400);
};

const creationSchema = Yup.object().shape({
  name: Yup.string().required().min(2),
  planId: Yup.number().required().integer().min(1),
  adminName: Yup.string().required().min(2),
  adminEmail: Yup.string().required().email(),
  adminPassword: Yup.string().required().min(5)
});

const updateSchema = Yup.object().shape({
  name: Yup.string().min(2),
  planId: Yup.number().integer().min(1),
  status: Yup.string(),
  dueDate: Yup.string().nullable()
});

export const index = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const companies = await Company.findAll({
    include: [
      { model: Plan, as: "plan" },
      {
        model: User,
        as: "users",
        attributes: ["id", "name", "email", "profile"]
      }
    ],
    order: [["id", "ASC"]]
  });

  return res.status(200).json(companies);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  await creationSchema.validate(req.body);

  const {
    name,
    planId,
    status,
    dueDate,
    adminName,
    adminEmail,
    adminPassword
  } = req.body;

  const existingCompany = await Company.findOne({
    where: { name: String(name).trim() }
  });

  if (existingCompany) {
    throw new AppError("ERR_COMPANY_NAME_ALREADY_EXISTS", 409);
  }

  const plan = await Plan.findByPk(Number(planId));

  if (!plan) {
    throw new AppError("ERR_NO_PLAN_FOUND", 404);
  }

  if (Number(plan.usersLimit || 0) <= 0) {
    throw new AppError("ERR_PLAN_USER_LIMIT_REACHED", 403);
  }

  const company = await Company.create({
    name: String(name).trim(),
    planId: Number(planId),
    status: parseStatus(status),
    dueDate: parseDate(dueDate)
  });

  try {
    await CreateUserService({
      name: String(adminName).trim(),
      email: String(adminEmail).trim().toLowerCase(),
      password: String(adminPassword),
      profile: "admin",
      queueIds: [],
      companyId: company.id
    });
  } catch (error) {
    await company.destroy();
    throw error;
  }

  const hydratedCompany = await Company.findByPk(company.id, {
    include: [
      { model: Plan, as: "plan" },
      {
        model: User,
        as: "users",
        attributes: ["id", "name", "email", "profile"]
      }
    ]
  });

  return res.status(201).json(hydratedCompany);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  await updateSchema.validate(req.body);

  const { companyId } = req.params;
  const { name, planId, status, dueDate } = req.body;

  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  if (name && String(name).trim() !== company.name) {
    const existingCompany = await Company.findOne({
      where: { name: String(name).trim() }
    });

    if (existingCompany) {
      throw new AppError("ERR_COMPANY_NAME_ALREADY_EXISTS", 409);
    }
  }

  if (planId) {
    const plan = await Plan.findByPk(Number(planId));

    if (!plan) {
      throw new AppError("ERR_NO_PLAN_FOUND", 404);
    }
  }

  await company.update({
    name: name ? String(name).trim() : company.name,
    planId: planId ? Number(planId) : company.planId,
    status: status ? parseStatus(status) : company.status,
    dueDate: dueDate !== undefined ? parseDate(dueDate) : company.dueDate
  });

  const hydratedCompany = await Company.findByPk(company.id, {
    include: [
      { model: Plan, as: "plan" },
      {
        model: User,
        as: "users",
        attributes: ["id", "name", "email", "profile"]
      }
    ]
  });

  return res.status(200).json(hydratedCompany);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  ensureSuperAdmin(req.user.profile);

  const { companyId } = req.params;

  const company = await Company.findByPk(companyId, {
    include: [{ model: Plan, as: "plan" }]
  });

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  await company.update({ status: "inactive" });

  return res.status(200).json({ message: "Company inactivated" });
};

