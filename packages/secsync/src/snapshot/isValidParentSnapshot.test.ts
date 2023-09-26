import sodium from "libsodium-wrappers";
import { hash } from "../crypto/hash";
import { createParentSnapshotProof } from "./createParentSnapshotProof";
import { isValidParentSnapshot } from "./isValidParentSnapshot";

let parentSnapshotCiphertextHash: string;
let parentSnapshotProof: string;
const grandParentSnapshotProof = "abc";
const parentSnapshotId = "id12345";

beforeEach(async () => {
  await sodium.ready;
  const parentSnapshotCiphertext = "cde";
  parentSnapshotCiphertextHash = hash(parentSnapshotCiphertext, sodium);
  parentSnapshotProof = createParentSnapshotProof({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    sodium,
  });
});

test("it returns true for a valid proof", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(true);
});

test("it returns false to due a changed parentSnapshotCiphertext", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash: "wrong",
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});

test("it returns false to due a changed grandParentSnapshotProof", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof: "wrong",
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});

test("it returns false if parentSnapshotCiphertextHash and grandParentSnapshotProof are flipped", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof: parentSnapshotCiphertextHash,
    parentSnapshotId,
    parentSnapshotCiphertextHash: grandParentSnapshotProof,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});

test("it returns false to due a manipulated parentSnapshotProof", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof: "WRONG",
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});

test("it returns false for a changed parentSnapshotId", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotId: "WRONG_ID",
    parentSnapshotCiphertextHash,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotId,
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdateClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});
