import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { ParentSnapshotProofInfo, Snapshot } from "../types";
import { isValidParentSnapshot } from "./isValidParentSnapshot";

export function verifyAndDecryptSnapshot(
  snapshot: Snapshot,
  key: Uint8Array,
  currentDocId: string,
  currentClientPublicKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers"),
  parentSnapshotProofInfo?: ParentSnapshotProofInfo,
  parentSnapshotUpdateClock?: number
) {
  const publicKey = sodium.from_base64(snapshot.publicData.pubKey);

  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(snapshot.publicData) as string
  );

  const isValid = verifySignature(
    {
      nonce: snapshot.nonce,
      ciphertext: snapshot.ciphertext,
      publicData: publicDataAsBase64,
    },
    snapshot.signature,
    publicKey,
    sodium
  );
  if (!isValid) {
    throw new Error("Invalid snapshot");
  }

  if (currentDocId !== snapshot.publicData.docId) {
    throw new Error("Invalid docId for snapshot");
  }

  if (parentSnapshotProofInfo) {
    const isValid = isValidParentSnapshot({
      snapshot,
      parentSnapshotCiphertext: parentSnapshotProofInfo.ciphertext,
      parentSnapshotId: parentSnapshotProofInfo.id,
      grandParentSnapshotProof: parentSnapshotProofInfo.parentSnapshotProof,
      sodium,
    });
    if (!isValid) {
      throw new Error("Invalid parent snapshot verification");
    }
  }

  if (parentSnapshotUpdateClock !== undefined) {
    const currentClientPublicKeyString = sodium.to_base64(
      currentClientPublicKey
    );

    if (
      snapshot.publicData.parentSnapshotUpdateClocks[
        currentClientPublicKeyString
      ] !== parentSnapshotUpdateClock
    ) {
      throw new Error("Invalid updateClock for the parent snapshot");
    }
  }

  return decryptAead(
    sodium.from_base64(snapshot.ciphertext),
    publicDataAsBase64,
    key,
    snapshot.nonce,
    sodium
  );
}
