import Setting from "../../models/Setting";

const GetSettingValueService = async (
  key: string,
  fallback?: string
): Promise<string | undefined> => {
  const setting = await Setting.findByPk(key);

  if (!setting) {
    return fallback;
  }

  return setting.value;
};

export default GetSettingValueService;
