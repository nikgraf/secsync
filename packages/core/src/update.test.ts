import sodiumWrappers from "libsodium-wrappers";
import sodium, { KeyPair } from "@naisho/libsodium";
import { v4 as uuidv4 } from "uuid";
import { UpdatePublicData } from "./types";
import { createUpdate, verifyAndDecryptUpdate } from "./update";

test.skip("createUpdate & verifyAndDecryptUpdate successfully", async () => {
  await sodium.ready;

  const key = sodiumWrappers.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodiumWrappers.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodiumWrappers.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = await createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = await verifyAndDecryptUpdate(
    update,
    key,
    signatureKeyPair.publicKey
  );
  if (result === null) {
    throw new Error("Update could not be verified.");
  }
  expect(sodium.from_base64_to_string(result)).toBe("Hello World");
});

test("createUpdate & verifyAndDecryptUpdate break due changed signature", async () => {
  await sodium.ready;

  const key = sodiumWrappers.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodiumWrappers.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodiumWrappers.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = await createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = await verifyAndDecryptUpdate(
    {
      ...update,
      signature: update.signature.replace(/^./, "a"),
    },
    key,
    signatureKeyPair.publicKey
  );
  expect(result).toBeNull();
});

test("createUpdate & verifyAndDecryptUpdate break due changed ciphertext", async () => {
  await sodium.ready;

  const key = sodiumWrappers.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodiumWrappers.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodiumWrappers.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = await createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = await verifyAndDecryptUpdate(
    {
      ...update,
      ciphertext: update.ciphertext.replace(/^./, "a"),
    },
    key,
    signatureKeyPair.publicKey
  );
  expect(result).toBeNull();
});
