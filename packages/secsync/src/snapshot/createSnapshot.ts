import canonicalize from "canonicalize";
import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import {
  Snapshot,
  SnapshotPublicData,
  SnapshotPublicDataWithParentSnapshotProof,
} from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

export function createSnapshot<AdditionalSnapshotPublicData>(
  content: Uint8Array | string,
  publicData: SnapshotPublicData & AdditionalSnapshotPublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair,
  parentSnapshotCiphertext: string,
  grandParentSnapshotProof: string,
  sodium: typeof import("libsodium-wrappers")
) {
  const extendedPublicData: SnapshotPublicDataWithParentSnapshotProof &
    AdditionalSnapshotPublicData = {
    ...publicData,
    parentSnapshotProof: createParentSnapshotProof({
      parentSnapshotCiphertext,
      grandParentSnapshotProof,
      sodium,
    }),
  };

  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(extendedPublicData) as string
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
