import faker from "faker";
import User from "../../../models/User";
import CreateUserService from "../../../services/UserServices/CreateUserService";
import ListUsersService from "../../../services/UserServices/ListUsersService";
import { disconnect, truncate } from "../../utils/database";

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

  it("should be able to list users", async () => {
    await CreateUserService({
      name: faker.name.findName(),
      email: faker.internet.email(),
      password: faker.internet.password(),
      companyId: COMPANY_ID
    });

    const response = await ListUsersService({
      pageNumber: 1
    });

    expect(response).toHaveProperty("users");
    expect(response.users[0]).toBeInstanceOf(User);
  });
});
