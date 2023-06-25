import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { UpdatePublicData } from "../types";
import { createUpdate } from "./createUpdate";
import { verifyAndDecryptUpdate } from "./verifyAndDecryptUpdate";

test("createUpdate & verifyAndDecryptUpdate successfully", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: generateId(sodium),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair,
    0,
    sodium
  );

  const { content, clock } = verifyAndDecryptUpdate(
    update,
    key,
    signatureKeyPair.publicKey,
    -1,
    sodium
  );
  if (content === null) {
    throw new Error("Update could not be verified.");
  }
  expect(sodium.to_string(content)).toBe("Hello World");
  expect(clock).toBe(0);
});

test("createUpdate & verifyAndDecryptUpdate successfully with higher clock number", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: generateId(sodium),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair,
    10,
    sodium
  );

  const { content, clock } = verifyAndDecryptUpdate(
    update,
    key,
    signatureKeyPair.publicKey,
    9,
    sodium
  );
  if (content === null) {
    throw new Error("Update could not be verified.");
  }
  expect(sodium.to_string(content)).toBe("Hello World");
  expect(clock).toBe(10);
});

test("createUpdate & verifyAndDecryptUpdate break due changed signature", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: generateId(sodium),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair,
    0,
    sodium
  );

  expect(() =>
    verifyAndDecryptUpdate(
      {
        ...update,
        signature: update.signature.replace(/^./, "a"),
      },
      key,
      signatureKeyPair.publicKey,
      -1,
      sodium
    )
  ).toThrowError();
});

test("createUpdate & verifyAndDecryptUpdate break due changed ciphertext", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: generateId(sodium),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair,
    0,
    sodium
  );

  expect(() =>
    verifyAndDecryptUpdate(
      {
        ...update,
        ciphertext: update.ciphertext.replace(/^./, "a"),
      },
      key,
      signatureKeyPair.publicKey,
      -1,
      sodium
    )
  ).toThrowError();
});

test("createUpdate & verifyAndDecryptUpdate fail due invalid clock", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: UpdatePublicData = {
    refSnapshotId: generateId(sodium),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "Hello World",
    publicData,
    key,
    signatureKeyPair,
    0,
    sodium
  );

  expect(() =>
    verifyAndDecryptUpdate(update, key, signatureKeyPair.publicKey, 10, sodium)
  ).toThrowError();
});
