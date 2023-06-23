import type { KeyPair } from "libsodium-wrappers";
import { SnapshotPublicData } from "../types";
import { createSnapshot } from "./createSnapshot";

export function createInitialSnapshot<AdditionalSnapshotPublicData>(
  content: Uint8Array | string,
  publicData: SnapshotPublicData & AdditionalSnapshotPublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair,
  sodium: typeof import("libsodium-wrappers")
) {
  const snapshot = createSnapshot<AdditionalSnapshotPublicData>(
    content,
    publicData,
    key,
    signatureKeyPair,
    "",
    "",
    sodium
  );
  return snapshot;
}
