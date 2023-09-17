import sodium from "libsodium-wrappers";
import { isValidParentSnapshot } from "./isValidParentSnapshot";

const grandParentSnapshotProof = "abc";
const parentSnapshotCiphertext = "cde";
const parentSnapshotId = "id12345";
const parentSnapshotProof = "iw2EmzL2GvbiJr15Q2LFO5j5g883nEuLfs9jCRtxTUA";

test("it returns true for a valid proof", () => {
  const isValid = isValidParentSnapshot({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdatesClocks: {},
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
    parentSnapshotCiphertext: "wrong",
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdatesClocks: {},
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
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdatesClocks: {},
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
    parentSnapshotId,
    parentSnapshotCiphertext: grandParentSnapshotProof,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof,
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdatesClocks: {},
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
    parentSnapshotCiphertext,
    snapshot: {
      nonce: "nonce",
      ciphertext: "ciphertext",
      publicData: {
        parentSnapshotProof: "WRONG",
        docId: "docId",
        snapshotId: "snapshotId",
        pubKey: "pubKey",
        parentSnapshotUpdatesClocks: {},
      },
      signature: "signature",
    },
    sodium,
  });
  expect(isValid).toBe(false);
});
