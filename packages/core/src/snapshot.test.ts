import sodium from "libsodium-wrappers";
import { v4 as uuidv4 } from "uuid";
import { SnapshotPublicData } from "./types";
import { createSnapshot, verifyAndDecryptSnapshot } from "./snapshot";

test("createSnapshot & verifyAndDecryptSnapshot successfully", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: sodium.KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: SnapshotPublicData = {
    snapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = verifyAndDecryptSnapshot(
    snapshot,
    key,
    signatureKeyPair.publicKey
  );
  expect(new TextDecoder().decode(result)).toBe("Hello World");
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed signature", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: sodium.KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: SnapshotPublicData = {
    snapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = verifyAndDecryptSnapshot(
    {
      ...snapshot,
      signature: snapshot.signature.replace(/^./, "a"),
    },
    key,
    signatureKeyPair.publicKey
  );
  expect(result).toBeNull();
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed ciphertext", async () => {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signatureKeyPair: sodium.KeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const publicData: SnapshotPublicData = {
    snapshotId: uuidv4(),
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPair
  );

  const result = verifyAndDecryptSnapshot(
    {
      ...snapshot,
      ciphertext: snapshot.ciphertext.replace(/^./, "a"),
    },
    key,
    signatureKeyPair.publicKey
  );
  expect(result).toBeNull();
});
