import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { SnapshotPublicData } from "../types";
import { createSnapshot } from "./createSnapshot";
import { verifyAndDecryptSnapshot } from "./verifyAndDecryptSnapshot";

// TODO add tests for parentSnapshotProofInfo and parentSnapshotUpdateClock in verifyAndDecryptSnapshot

let signatureKeyPairA: KeyPair;
let key: Uint8Array;

beforeEach(async () => {
  await sodium.ready;

  signatureKeyPairA = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );
});

test("createSnapshot & verifyAndDecryptSnapshot successfully", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotClocks: {},
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPairA,
    "",
    "",
    sodium
  );

  const result = verifyAndDecryptSnapshot(
    snapshot,
    key,
    signatureKeyPairA.publicKey,
    signatureKeyPairA.publicKey,
    sodium
  );
  if (result === null) {
    throw new Error("Snapshot could not be verified.");
  }
  expect(sodium.to_string(result)).toBe("Hello World");
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed signature", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotClocks: {},
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPairA,
    "",
    "",
    sodium
  );

  expect(() =>
    verifyAndDecryptSnapshot(
      {
        ...snapshot,
        signature: snapshot.signature.replace(/^./, "a"),
      },
      key,
      signatureKeyPairA.publicKey,
      signatureKeyPairA.publicKey,
      sodium
    )
  ).toThrowError();
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed ciphertext", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotClocks: {},
  };

  const snapshot = createSnapshot(
    "Hello World",
    publicData,
    key,
    signatureKeyPairA,
    "",
    "",
    sodium
  );

  expect(() =>
    verifyAndDecryptSnapshot(
      {
        ...snapshot,
        ciphertext: snapshot.ciphertext.replace(/^./, "a"),
      },
      key,
      signatureKeyPairA.publicKey,
      signatureKeyPairA.publicKey,
      sodium
    )
  ).toThrowError();
});
