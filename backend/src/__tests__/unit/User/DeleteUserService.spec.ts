import faker from "faker";
import AppError from "../../../errors/AppError";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import { disconnect, truncate } from "../../utils/database";

// Evita carregar dependencias de runtime externo no contexto unitario deste spec.
jest.mock("../../../helpers/UpdateDeletedUserOpenTicketsStatus", () => jest.fn());
const DeleteUserService = require("../../../services/UserServices/DeleteUserService")
  .default;

const COMPANY_ID = 1;

describe("User", () => {
  beforeEach(async () => {
    await truncate();
  });

  afterEach(async () => {
    await truncate();
  });

  afterAll(async () => {
    await disconnect();
  });

  it("should be delete a existing user", async () => {
    const { id } = await CreateUserService({
      name: faker.name.findName(),
      email: faker.internet.email(),
      password: faker.internet.password(),
      companyId: COMPANY_ID
    });

    expect(DeleteUserService(id)).resolves.not.toThrow();
  });

  it("to throw an error if tries to delete a non existing user", async () => {
    expect(DeleteUserService(faker.random.number())).rejects.toBeInstanceOf(
      AppError
    );
  });
});
