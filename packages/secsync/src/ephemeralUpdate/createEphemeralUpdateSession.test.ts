import sodium from "libsodium-wrappers";
import { createEphemeralUpdateSession } from "./createEphemeralUpdateSession";

beforeEach(async () => {
  await sodium.ready;
});

test("should return an object with id and counter", () => {
  const result = createEphemeralUpdateSession(sodium);
  expect(result).toHaveProperty("id");
  expect(typeof result.id).toBe("string");
  expect(result).toHaveProperty("counter");
  expect(typeof result.counter).toBe("number");
});
