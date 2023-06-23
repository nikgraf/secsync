import sodium from "libsodium-wrappers";
import { isValidParentSnapshot } from "./isValidParentSnapshot";

const grandParentSnapshotProof = "abc";
const parentSnapshotCiphertext = "cde";
const parentSnapshotProof = "mKrictj1UUr_hkqYpO9cAw_MeZe9IDTi7une4tPjasg";

test("it returns true for a valid proof", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotClocks: {},
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
    parentSnapshotCiphertext: "wrong",
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotClocks: {},
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
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});

test("it returns false if parentSnapshotCiphertext and grandParentSnapshotProof are flipped", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof: parentSnapshotCiphertext,
    parentSnapshotCiphertext: grandParentSnapshotProof,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotClocks: {},
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
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof: "WRONG",
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});
