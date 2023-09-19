import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { SnapshotPublicData } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";
import { createSnapshot } from "./createSnapshot";
import { verifyAndDecryptSnapshot } from "./verifyAndDecryptSnapshot";

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
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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
      sodium
    )
  ).toThrowError();
});

test("createSnapshot & verifyAndDecryptSnapshot successfully with verifying direct parentSnapshotProof", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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

  const snapshotId2 = generateId(sodium);
  const publicData2: SnapshotPublicData = {
    snapshotId: snapshotId2,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {},
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    snapshot.ciphertext,
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const snapshotId3 = generateId(sodium);
  const publicData3: SnapshotPublicData = {
    snapshotId: snapshotId3,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {},
  };
  const snapshot3 = createSnapshot(
    "Hello World3",
    publicData3,
    key,
    signatureKeyPairA,
    snapshot2.ciphertext,
    snapshot2.publicData.parentSnapshotProof,
    sodium
  );

  const result = verifyAndDecryptSnapshot(
    snapshot,
    key,
    signatureKeyPairA.publicKey,
    sodium,
    {
      id: "",
      ciphertext: "",
      parentSnapshotProof: "",
    }
  );
  if (result === null) {
    throw new Error("Snapshot could not be verified.");
  }
  expect(sodium.to_string(result)).toBe("Hello World");

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    signatureKeyPairA.publicKey,
    sodium,
    {
      id: snapshot.publicData.snapshotId,
      ciphertext: snapshot.ciphertext,
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    }
  );
  if (result === null) {
    throw new Error("Snapshot could not be verified.");
  }
  expect(sodium.to_string(result2)).toBe("Hello World2");

  const result3 = verifyAndDecryptSnapshot(
    snapshot3,
    key,
    signatureKeyPairA.publicKey,
    sodium,
    {
      id: snapshot2.publicData.snapshotId,
      ciphertext: snapshot2.ciphertext,
      parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
    }
  );

  expect(sodium.to_string(result3)).toBe("Hello World3");
});

test("createSnapshot & verifyAndDecryptSnapshot breaks due manipulated parentSnapshotProof of initial snapshot", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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

  const snapshotId2 = generateId(sodium);
  const publicData2: SnapshotPublicData = {
    snapshotId: snapshotId2,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {},
  };

  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,

    snapshot.ciphertext,
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot.ciphertext,
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotCiphertext: snapshot.ciphertext, // wrong ciphertext
          parentSnapshotId: snapshot.publicData.snapshotId,
          grandParentSnapshotProof: "",
          sodium,
        }),
      }
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot.ciphertext,
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotCiphertext: "",
          parentSnapshotId: snapshot.publicData.snapshotId,
          grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof, // wrong proof
          sodium,
        }),
      }
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot2.ciphertext, // wrong ciphertext
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotId: "",
          parentSnapshotCiphertext: "",
          grandParentSnapshotProof: "",
          sodium,
        }),
      }
    )
  ).toThrowError();
});

test("createSnapshot & verifyAndDecryptSnapshot breaks due manipulated parentSnapshotProof of snapshot with a parent", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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

  const snapshotId2 = generateId(sodium);
  const publicData2: SnapshotPublicData = {
    snapshotId: snapshotId2,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {},
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    snapshot.ciphertext,
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const snapshotId3 = generateId(sodium);
  const publicData3: SnapshotPublicData = {
    snapshotId: snapshotId3,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {},
  };
  const snapshot3 = createSnapshot(
    "Hello World3",
    publicData3,
    key,
    signatureKeyPairA,
    snapshot2.ciphertext,
    snapshot2.publicData.parentSnapshotProof,
    sodium
  );

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot3,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot2.publicData.snapshotId,
        ciphertext: snapshot2.ciphertext,
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotId: snapshot.publicData.snapshotId,
          parentSnapshotCiphertext: snapshot2.ciphertext, // wrong ciphertext
          grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          sodium,
        }),
      }
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot3,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot2.publicData.snapshotId,
        ciphertext: snapshot2.ciphertext,
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotId: snapshot.publicData.snapshotId,
          parentSnapshotCiphertext: snapshot.ciphertext,
          grandParentSnapshotProof: snapshot2.publicData.parentSnapshotProof, // wrong proof
          sodium,
        }),
      }
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot3,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot2.publicData.snapshotId,
        ciphertext: snapshot3.ciphertext, // wrong ciphertext
        parentSnapshotProof: createParentSnapshotProof({
          parentSnapshotId: snapshot.publicData.snapshotId,
          parentSnapshotCiphertext: snapshot.ciphertext,
          grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          sodium,
        }),
      }
    )
  ).toThrowError();
});

test("createSnapshot & verifyAndDecryptSnapshot successfully with verifying the client's own parentSnapshotUpdatesClocks", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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

  const snapshotId2 = generateId(sodium);
  const publicData2: SnapshotPublicData = {
    snapshotId: snapshotId2,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {
      [sodium.to_base64(signatureKeyPairA.publicKey)]: 10,
    },
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    snapshot.ciphertext,
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    signatureKeyPairA.publicKey,
    sodium,
    {
      id: snapshot.publicData.snapshotId,
      ciphertext: snapshot.ciphertext,
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    10 // no clock should be present
  );

  expect(sodium.to_string(result2)).toBe("Hello World2");
});

test("createSnapshot & verifyAndDecryptSnapshot fails due a wrong parentSnapshotUpdatesClocks", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdatesClocks: {},
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

  const snapshotId2 = generateId(sodium);
  const publicData2: SnapshotPublicData = {
    snapshotId: snapshotId2,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdatesClocks: {
      [sodium.to_base64(signatureKeyPairA.publicKey)]: 10,
    },
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    snapshot.ciphertext,
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: "",
        ciphertext: "",
        parentSnapshotProof: "",
      },
      10 // no clock should be present
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot.ciphertext,
        parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
      },
      11 // clock should be 10
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot.ciphertext,
        parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
      },
      9 // clock should be 10
    )
  ).toThrowError();

  expect(() =>
    verifyAndDecryptSnapshot(
      snapshot2,
      key,
      signatureKeyPairA.publicKey,
      sodium,
      {
        id: snapshot.publicData.snapshotId,
        ciphertext: snapshot.ciphertext,
        parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
      },
      0 // clock should be 10
    )
  ).toThrowError();
});
