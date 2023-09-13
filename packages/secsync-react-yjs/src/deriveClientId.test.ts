import sodium from "libsodium-wrappers";
import { deriveClientId } from "./deriveClientId";

beforeEach(async () => {
  await sodium.ready;
});

test("deriveClientId returns a number", () => {
  const keyPair = sodium.crypto_sign_seed_keypair(
    new Uint8Array([
      229, 43, 20, 135, 69, 155, 48, 171, 79, 154, 231, 124, 110, 209, 34, 85,
      227, 79, 233, 201, 219, 181, 30, 37, 9, 26, 116, 135, 235, 163, 255, 59,
    ])
  );
  const clientId = deriveClientId({
    sodium,
    clientPublicKey: keyPair.publicKey,
  });
  expect(typeof clientId).toBe("number");
});
