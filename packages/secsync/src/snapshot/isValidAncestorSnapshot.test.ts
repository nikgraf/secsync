import sodium from "libsodium-wrappers";
import { hash } from "../crypto/hash";
import { createParentSnapshotProof } from "./createParentSnapshotProof";
import {
  isValidAncestorSnapshot,
  SnapshotProofChainEntry,
} from "./isValidAncestorSnapshot";

let snapshot1ProofEntry: SnapshotProofChainEntry;
let snapshot2ProofEntry: SnapshotProofChainEntry;
let snapshot3ProofEntry: SnapshotProofChainEntry;
let snapshot4ProofEntry: SnapshotProofChainEntry;

const createDummySnapshot = (
  parentSnapshotProof: string,
  ciphertext: string
) => {
  return {
    nonce: "nonce",
    ciphertext,
    publicData: {
      parentSnapshotProof,
      docId: "docId",
      subkeyId: 1,
      snapshotId: "snapshotId",
      pubKey: "pubKey",
      keyDerivationTrace: {
        workspaceKeyId: "workspaceKeyId",
        trace: [],
      },
      parentSnapshotClocks: {},
    },
    signature: "signature",
  };
};

beforeEach(() => {
  const snapshot1Proof = createParentSnapshotProof({
    grandParentSnapshotProof: "",
    parentSnapshotCiphertext: "",
    sodium,
  });
  snapshot1ProofEntry = {
    parentSnapshotProof: snapshot1Proof,
    snapshotCiphertextHash: hash("abc", sodium),
  };
  const snapshot2Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot1Proof,
    parentSnapshotCiphertext: "abc",
    sodium,
  });
  snapshot2ProofEntry = {
    parentSnapshotProof: snapshot2Proof,
    snapshotCiphertextHash: hash("def", sodium),
  };
  const snapshot3Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot2Proof,
    parentSnapshotCiphertext: "def",
    sodium,
  });
  snapshot3ProofEntry = {
    parentSnapshotProof: snapshot3Proof,
    snapshotCiphertextHash: hash("ghi", sodium),
  };
  const snapshot4Proof = createParentSnapshotProof({
    grandParentSnapshotProof: snapshot3Proof,
    parentSnapshotCiphertext: "ghi",
    sodium,
  });
  snapshot4ProofEntry = {
    parentSnapshotProof: snapshot4Proof,
    snapshotCiphertextHash: hash("jkl", sodium),
  };
});

test("returns true for a valid proof of one item", () => {
  const snapshotProofChain = [snapshot3ProofEntry];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
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
      snapshot3ProofEntry.parentSnapshotProof,
      "ghi"
    ),
    sodium,
  });
  expect(isValid).toBe(false);
});

test("returns false for an empty chain", () => {
  const snapshotProofChain = [];
  const isValid = isValidAncestorSnapshot({
    knownSnapshotProofEntry: snapshot2ProofEntry,
    snapshotProofChain,
    currentSnapshot: createDummySnapshot(
      snapshot3ProofEntry.parentSnapshotProof,
      "ghi"
    ),
    sodium,
  });
  expect(isValid).toBe(false);
});
