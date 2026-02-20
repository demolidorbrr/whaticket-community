import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as CompanyController from "../controllers/CompanyController";

const companyRoutes = Router();

companyRoutes.get("/companies", isAuth, CompanyController.index);
companyRoutes.post("/companies", isAuth, CompanyController.store);
companyRoutes.put("/companies/:companyId", isAuth, CompanyController.update);
companyRoutes.delete("/companies/:companyId", isAuth, CompanyController.remove);

export default companyRoutes;

