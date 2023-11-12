import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { hash } from "../crypto/hash";
import { SnapshotPublicData } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";
import { createSnapshot } from "./createSnapshot";
import { verifyAndDecryptSnapshot } from "./verifyAndDecryptSnapshot";

const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    signatureKeyPairA.publicKey,
    sodium
  );
  expect(sodium.to_string(result.content as Uint8Array)).toBe("Hello World");
  expect(result.error).toBeUndefined();
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed signature", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    {
      ...snapshot,
      signature: snapshot.signature.replace(/^.{5}/, "aaaaa"),
    },
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium
  );
  expect(result.content).toBeUndefined();
  expect(result.error).toBeDefined();
  expect(result.error?.message).toBe("SECSYNC_ERROR_111");
});

test("createSnapshot & verifyAndDecryptSnapshot break due changed ciphertext", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    {
      ...snapshot,
      ciphertext: "aaa" + snapshot.ciphertext.substring(3),
    },
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium
  );

  expect(result.content).toBeUndefined();
  expect(result.error).toBeDefined();
  expect(result.error?.message).toBe("SECSYNC_ERROR_111");
});

test("createSnapshot & verifyAndDecryptSnapshot successfully with verifying direct parentSnapshotProof", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdateClocks: {},
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    hash(snapshot.ciphertext, sodium),
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const snapshotId3 = generateId(sodium);
  const publicData3: SnapshotPublicData = {
    snapshotId: snapshotId3,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotUpdateClocks: {},
  };
  const snapshot3 = createSnapshot(
    "Hello World3",
    publicData3,
    key,
    signatureKeyPairA,
    hash(snapshot2.ciphertext, sodium),
    snapshot2.publicData.parentSnapshotProof,
    sodium
  );

  const result = verifyAndDecryptSnapshot(
    snapshot,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: "",
      snapshotCiphertextHash: "",
      parentSnapshotProof: "",
    }
  );
  expect(sodium.to_string(result.content as Uint8Array)).toBe("Hello World");
  expect(result.error).toBeUndefined();

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    }
  );
  expect(sodium.to_string(result2.content as Uint8Array)).toBe("Hello World2");
  expect(result2.error).toBeUndefined();

  const result3 = verifyAndDecryptSnapshot(
    snapshot3,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot2.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
      parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
    }
  );

  expect(sodium.to_string(result3.content as Uint8Array)).toBe("Hello World3");
  expect(result3.error).toBeUndefined();
});

test("createSnapshot & verifyAndDecryptSnapshot breaks due manipulated parentSnapshotProof of initial snapshot", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdateClocks: {},
  };

  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    hash(snapshot.ciphertext, sodium),
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const result1 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium), // wrong ciphertext
        parentSnapshotId: snapshot.publicData.snapshotId,
        grandParentSnapshotProof: "",
        sodium,
      }),
    }
  );

  expect(result1.content).toBeUndefined();
  expect(result1.error).toBeDefined();
  expect(result1.error?.message).toBe("SECSYNC_ERROR_112");

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotCiphertextHash: "",
        parentSnapshotId: snapshot.publicData.snapshotId,
        grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof, // wrong proof
        sodium,
      }),
    }
  );

  expect(result2.content).toBeUndefined();
  expect(result2.error).toBeDefined();
  expect(result2.error?.message).toBe("SECSYNC_ERROR_112");

  const result3 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotId: "",
        parentSnapshotCiphertextHash: "",
        grandParentSnapshotProof: "",
        sodium,
      }),
    }
  );

  expect(result3.content).toBeUndefined();
  expect(result3.error).toBeDefined();
  expect(result3.error?.message).toBe("SECSYNC_ERROR_112");
});

test("createSnapshot & verifyAndDecryptSnapshot breaks due manipulated parentSnapshotProof of snapshot with a parent", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdateClocks: {},
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    hash(snapshot.ciphertext, sodium),
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const snapshotId3 = generateId(sodium);
  const publicData3: SnapshotPublicData = {
    snapshotId: snapshotId3,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotUpdateClocks: {},
  };
  const snapshot3 = createSnapshot(
    "Hello World3",
    publicData3,
    key,
    signatureKeyPairA,
    hash(snapshot2.ciphertext, sodium),
    snapshot2.publicData.parentSnapshotProof,
    sodium
  );

  const result1 = verifyAndDecryptSnapshot(
    snapshot3,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot2.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotId: snapshot.publicData.snapshotId,
        parentSnapshotCiphertextHash: snapshot2.ciphertext, // wrong ciphertext
        grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
        sodium,
      }),
    }
  );

  expect(result1.content).toBeUndefined();
  expect(result1.error).toBeDefined();
  expect(result1.error?.message).toBe("SECSYNC_ERROR_112");

  const result2 = verifyAndDecryptSnapshot(
    snapshot3,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot2.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotId: snapshot.publicData.snapshotId,
        parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
        grandParentSnapshotProof: snapshot2.publicData.parentSnapshotProof, // wrong proof
        sodium,
      }),
    }
  );
  expect(result2.content).toBeUndefined();
  expect(result2.error).toBeDefined();
  expect(result2.error?.message).toBe("SECSYNC_ERROR_112");

  const result3 = verifyAndDecryptSnapshot(
    snapshot3,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot2.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot3.ciphertext, sodium), // wrong ciphertext
      parentSnapshotProof: createParentSnapshotProof({
        parentSnapshotId: snapshot.publicData.snapshotId,
        parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
        grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
        sodium,
      }),
    }
  );
  expect(result3.content).toBeUndefined();
  expect(result3.error).toBeDefined();
  expect(result3.error?.message).toBe("SECSYNC_ERROR_112");
});

test("createSnapshot & verifyAndDecryptSnapshot successfully with verifying the client's own parentSnapshotUpdateClocks", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdateClocks: {
      [sodium.to_base64(signatureKeyPairA.publicKey)]: 10,
    },
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    hash(snapshot.ciphertext, sodium),
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium), // wrong ciphertext
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    10 // no clock should be present
  );

  expect(sodium.to_string(result2.content as Uint8Array)).toBe("Hello World2");
  expect(result2.error).toBeUndefined();
});

test("createSnapshot & verifyAndDecryptSnapshot fails due a wrong parentSnapshotUpdateClocks", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotUpdateClocks: {
      [sodium.to_base64(signatureKeyPairA.publicKey)]: 10,
    },
  };
  const snapshot2 = createSnapshot(
    "Hello World2",
    publicData2,
    key,
    signatureKeyPairA,
    hash(snapshot.ciphertext, sodium),
    snapshot.publicData.parentSnapshotProof,
    sodium
  );

  const result1 = verifyAndDecryptSnapshot(
    snapshot,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: "",
      snapshotCiphertextHash: "",
      parentSnapshotProof: "",
    },
    10 // no clock should be present
  );
  expect(result1.content).toBeUndefined();
  expect(result1.error).toBeDefined();
  expect(result1.error?.message).toBe("SECSYNC_ERROR_102");

  const result2 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    11 // clock should be 10
  );
  expect(result2.content).toBeUndefined();
  expect(result2.error).toBeDefined();
  expect(result2.error?.message).toBe("SECSYNC_ERROR_102");

  const result3 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    9 // clock should be 10
  );

  expect(result3.content).toBeUndefined();
  expect(result3.error).toBeDefined();
  expect(result3.error?.message).toBe("SECSYNC_ERROR_102");

  const result4 = verifyAndDecryptSnapshot(
    snapshot2,
    key,
    docId,
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: snapshot.publicData.snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    0 // clock should be 10
  );
  expect(result4.content).toBeUndefined();
  expect(result4.error).toBeDefined();
  expect(result4.error?.message).toBe("SECSYNC_ERROR_102");
});

test("verifyAndDecryptSnapshot fails due wrong docId", () => {
  const snapshotId = generateId(sodium);
  const publicData: SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPairA.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
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
    "WRONG_DOCUMENT_ID",
    signatureKeyPairA.publicKey,
    sodium,
    {
      snapshotId: "",
      snapshotCiphertextHash: "",
      parentSnapshotProof: "",
    }
  );

  expect(result.content).toBeUndefined();
  expect(result.error).toBeDefined();
  expect(result.error?.message).toBe("SECSYNC_ERROR_113");
});
