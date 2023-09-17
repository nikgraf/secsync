import { Snapshot } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

type IsValidParentSnapshotParams = {
  snapshot: Snapshot;
  parentSnapshotId: string;
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  sodium: typeof import("libsodium-wrappers");
};

export function isValidParentSnapshot({
  snapshot,
  grandParentSnapshotProof,
  parentSnapshotId,
  parentSnapshotCiphertext,
  sodium,
}: IsValidParentSnapshotParams) {
  const parentSnapshotProof = createParentSnapshotProof({
    parentSnapshotId,
    parentSnapshotCiphertext,
    grandParentSnapshotProof,
    sodium,
  });
  return parentSnapshotProof === snapshot.publicData.parentSnapshotProof;
}
