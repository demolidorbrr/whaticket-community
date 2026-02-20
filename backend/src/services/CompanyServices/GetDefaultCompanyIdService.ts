import AppError from "../../errors/AppError";
import Company from "../../models/Company";

const GetDefaultCompanyIdService = async (): Promise<number> => {
  const defaultCompany = await Company.findByPk(1, {
    attributes: ["id"]
  });

  if (defaultCompany) {
    return defaultCompany.id;
  }

  const firstCompany = await Company.findOne({
    attributes: ["id"],
    order: [["id", "ASC"]]
  });

  if (!firstCompany) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 500);
  }

  return firstCompany.id;
};

export default GetDefaultCompanyIdService;

