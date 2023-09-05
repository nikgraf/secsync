import { generateId } from "../crypto/generateId";

export function createEphemeralSession(
  sodium: typeof import("libsodium-wrappers")
) {
  const id = generateId(sodium);
  // max value for randombytes_uniform is 4294967295 (0xffffffff)
  //
  // Math.floor(4294967295 / 2) = 2147483647 was picked as upper_bound
  // since as it leaves plenty of numbers to increase, but is large
  // enough to not reveal any relevant Meta data
  const counter = sodium.randombytes_uniform(2147483647);
  const content = {
    id,
    counter,
  };

  return {
    ...content,
    validSessions: {},
  };
}
