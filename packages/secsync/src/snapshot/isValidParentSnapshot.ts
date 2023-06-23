import { Snapshot } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

type IsValidParentSnapshotParams = {
  snapshot: Snapshot;
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  sodium: typeof import("libsodium-wrappers");
};

export function isValidParentSnapshot({
  snapshot,
  grandParentSnapshotProof,
  parentSnapshotCiphertext,
  sodium,
}: IsValidParentSnapshotParams) {
  const parentSnapshotProof = createParentSnapshotProof({
    parentSnapshotCiphertext,
    grandParentSnapshotProof,
    sodium,
  });
  return parentSnapshotProof === snapshot.publicData.parentSnapshotProof;
}
