import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import {
  Snapshot,
  SnapshotPublicData,
  SnapshotPublicDataWithParentSnapshotProof,
} from "../types";
import { canonicalizeAndToBase64 } from "../utils/canonicalizeAndToBase64";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

export function createSnapshot<AdditionalSnapshotPublicData>(
  content: Uint8Array | string,
  publicData: SnapshotPublicData & AdditionalSnapshotPublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair,
  parentSnapshotCiphertextHash: string,
  grandParentSnapshotProof: string,
  sodium: typeof import("libsodium-wrappers")
) {
  const extendedPublicData: SnapshotPublicDataWithParentSnapshotProof &
    AdditionalSnapshotPublicData = {
    ...publicData,
    parentSnapshotProof: createParentSnapshotProof({
      parentSnapshotCiphertextHash,
      parentSnapshotId: publicData.parentSnapshotId,
      grandParentSnapshotProof,
      sodium,
    }),
  };

  const publicDataAsBase64 = canonicalizeAndToBase64(
    extendedPublicData,
    sodium
  );

  const { ciphertext, publicNonce } = encryptAead(
    content,
    publicDataAsBase64,
    key,
    sodium
  );
  const signature = sign(
    {
      nonce: publicNonce,
      ciphertext,
      publicData: publicDataAsBase64,
    },
    "secsync_snapshot",
    signatureKeyPair.privateKey,
    sodium
  );
  const snapshot: Snapshot & {
    publicData: AdditionalSnapshotPublicData & Snapshot["publicData"];
  } = {
    nonce: publicNonce,
    ciphertext,
    publicData: extendedPublicData,
    signature,
  };

  return snapshot;
}
