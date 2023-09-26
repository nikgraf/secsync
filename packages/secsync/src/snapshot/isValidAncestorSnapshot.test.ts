import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { hash } from "../crypto/hash";
import { SnapshotProofInfo, SnapshotPublicData } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";
import { createSnapshot } from "./createSnapshot";
import { isValidAncestorSnapshot } from "./isValidAncestorSnapshot";

let snapshot1ProofEntry: SnapshotProofInfo;
let snapshot2ProofEntry: SnapshotProofInfo;
let snapshot3ProofEntry: SnapshotProofInfo;
let snapshot4ProofEntry: SnapshotProofInfo;

const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
let signatureKeyPairA: KeyPair;
let key: Uint8Array;

const createDummySnapshot = (
  snapshotId: string,
  parentSnapshotId: string,
  parentSnapshotProof: string,
  ciphertext: string
) => {
  return {
    nonce: "nonce",
    ciphertext,
    publicData: {
      parentSnapshotId,
      parentSnapshotProof,
      docId: "docId",
      snapshotId,
      pubKey: "pubKey",
      keyDerivationTrace: {
        workspaceKeyId: "workspaceKeyId",
        trace: [],
      },
      parentSnapshotUpdateClocks: {},
    },
    signature: "signature",
  };
};

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

  const snapshot1Proof = createParentSnapshotProof({
    grandParentSnapshotProof: "",
    parentSnapshotId: "",
    parentSnapshotCiphertextHash: "",
    sodium,
  });
  snapshot1ProofEntry = {
    parentSnapshotProof: snapshot1Proof,
    snapshotId: "s1",
    snapshotCiphertextHash: hash("abc", sodium),
  };
  const snapshot2Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot1Proof,
    parentSnapshotId: "s1",
    parentSnapshotCiphertextHash: hash("abc", sodium),
    sodium,
  });
  snapshot2ProofEntry = {
    parentSnapshotProof: snapshot2Proof,
    snapshotId: "s2",
    snapshotCiphertextHash: hash("def", sodium),
  };
  const snapshot3Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot2Proof,
    parentSnapshotId: "s2",
    parentSnapshotCiphertextHash: hash("def", sodium),
    sodium,
  });
  snapshot3ProofEntry = {
    parentSnapshotProof: snapshot3Proof,
    snapshotId: "s3",
    snapshotCiphertextHash: hash("ghi", sodium),
  };
  const snapshot4Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot3Proof,
    parentSnapshotId: "s3",
    parentSnapshotCiphertextHash: hash("ghi", sodium),
    sodium,
  });
  snapshot4ProofEntry = {
    parentSnapshotProof: snapshot4Proof,
    snapshotId: "s4",
    snapshotCiphertextHash: hash("jkl", sodium),
  };
});

test("returns true for a valid proof of one item", () => {
  const snapshotProofChain = [snapshot3ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot3ProofEntry.snapshotId,
      snapshot2ProofEntry.snapshotId,
      snapshot3ProofEntry.parentSnapshotProof,
      "ghi"
    ),
    sodium,
  });
  expect(isValid).toBe(true);
});

test("returns false for an invalid proof due a modified proof", () => {
  const snapshotProofChain = [snapshot3ProofEntry];
  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: {
        ...snapshot2ProofEntry,
        parentSnapshotProof: "wrong",
      },
      snapshotProofChain,
      currentSnapshot: createDummySnapshot(
        snapshot3ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot3ProofEntry.parentSnapshotProof,
        "ghi"
      ),
      sodium,
    })
  ).toBe(false);

  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: snapshot2ProofEntry,
      snapshotProofChain: [
        {
          ...snapshot3ProofEntry,
          parentSnapshotProof: "wrong",
        },
      ],
      currentSnapshot: createDummySnapshot(
        snapshot3ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot2ProofEntry.parentSnapshotProof,
        "def"
      ),
      sodium,
    })
  ).toBe(false);

  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: snapshot2ProofEntry,
      snapshotProofChain: [
        snapshot3ProofEntry,
        {
          ...snapshot4ProofEntry,
          parentSnapshotProof: "wrong",
        },
      ],
      currentSnapshot: createDummySnapshot(
        snapshot3ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot2ProofEntry.parentSnapshotProof,
        "def"
      ),
      sodium,
    })
  ).toBe(false);
});

test("returns false for an invalid proof due a modified ciphertext hash", () => {
  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: {
        ...snapshot2ProofEntry,
        snapshotCiphertextHash: "wrong",
      },
      snapshotProofChain: [snapshot3ProofEntry],
      currentSnapshot: createDummySnapshot(
        snapshot3ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot3ProofEntry.parentSnapshotProof,
        "ghi"
      ),
      sodium,
    })
  ).toBe(false);

  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: snapshot2ProofEntry,
      snapshotProofChain: [
        {
          ...snapshot3ProofEntry,
          snapshotCiphertextHash: "wrong",
        },
        snapshot4ProofEntry,
      ],
      currentSnapshot: createDummySnapshot(
        snapshot4ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot4ProofEntry.parentSnapshotProof,
        "jkl"
      ),
      sodium,
    })
  ).toBe(false);

  expect(
    isValidAncestorSnapshot({
      knownSnapshotProofEntry: snapshot2ProofEntry,
      snapshotProofChain: [
        snapshot3ProofEntry,
        {
          ...snapshot4ProofEntry,
          snapshotCiphertextHash: "wrong",
        },
      ],
      currentSnapshot: createDummySnapshot(
        snapshot4ProofEntry.snapshotId,
        snapshot2ProofEntry.snapshotId,
        snapshot4ProofEntry.parentSnapshotProof,
        "jkl"
      ),
      sodium,
    })
  ).toBe(false);
});

test("returns true for valid proof of multiple items", () => {
  const snapshotProofChain = [snapshot3ProofEntry, snapshot4ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot4ProofEntry.snapshotId,
      snapshot2ProofEntry.snapshotId,
      snapshot4ProofEntry.parentSnapshotProof,
      "jkl"
    ),
    sodium,
  });
  expect(isValid).toBe(true);
});

test("returns true for a valid proof for the initial snapshot", () => {
  const snapshotProofChain = [snapshot2ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot1ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot2ProofEntry.snapshotId,
      snapshot1ProofEntry.snapshotId,
      snapshot2ProofEntry.parentSnapshotProof,
      "def"
    ),
    sodium,
  });
  expect(isValid).toBe(true);
});

test("returns false if an entry is missing", () => {
  const snapshotProofChain = [snapshot4ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot4ProofEntry.snapshotId,
      snapshot3ProofEntry.snapshotId,
      snapshot4ProofEntry.parentSnapshotProof,
      "jkl"
    ),
    sodium,
  });
  expect(isValid).toBe(false);
});

test("returns false if an entry is missing using an initial snapshot", () => {
  const snapshotProofChain = [snapshot3ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot1ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot3ProofEntry.snapshotId,
      snapshot2ProofEntry.snapshotId,
      snapshot3ProofEntry.parentSnapshotProof,
      "ghi"
    ),
    sodium,
  });
  expect(isValid).toBe(false);
});

test("returns true for an empty chain and identical snapshots", () => {
  const snapshotProofChain: SnapshotProofInfo[] = [];

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

  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: {
      snapshotId,
      snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    },
    snapshotProofChain,
    currentSnapshot: snapshot,
    sodium,
  });
  expect(isValid).toBe(true);
});

test("returns false for an empty chain and different snapshots", () => {
  const snapshotProofChain: SnapshotProofInfo[] = [];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot3ProofEntry.snapshotId,
      snapshot2ProofEntry.snapshotId,
      snapshot3ProofEntry.parentSnapshotProof,
      "ghi"
    ),
    sodium,
  });
  expect(isValid).toBe(false);
});
