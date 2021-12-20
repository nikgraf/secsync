import sodium from "libsodium-wrappers";
import { v4 as uuidv4 } from "uuid";
import { encryptAead, decryptAead } from "./crypto";

test("encryptAead and decryptAead", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const publicData = {
    snapshotId: uuidv4(),
  };

  const encryptedResult = encryptAead(
    "Hallo",
    sodium.to_base64(JSON.stringify(publicData)),
    key
  );

  const decryptedResult = decryptAead(
    encryptedResult.ciphertext,
    sodium.to_base64(JSON.stringify(publicData)),
    key,
    encryptedResult.publicNonce
  );
  expect(sodium.to_string(decryptedResult)).toEqual("Hallo");
});
