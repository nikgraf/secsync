import { Snapshot } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

type IsValidParentSnapshotParams = {
  snapshot: Snapshot;
  parentSnapshotId: string;
  parentSnapshotCiphertextHash: string;
  grandParentSnapshotProof: string;
  sodium: typeof import("libsodium-wrappers");
};

export function isValidParentSnapshot({
  snapshot,
  grandParentSnapshotProof,
  parentSnapshotId,
  parentSnapshotCiphertextHash,
  sodium,
}: IsValidParentSnapshotParams) {
  const parentSnapshotProof = createParentSnapshotProof({
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    grandParentSnapshotProof,
    sodium,
  });
  return (
    parentSnapshotProof === snapshot.publicData.parentSnapshotProof &&
    parentSnapshotId === snapshot.publicData.parentSnapshotId
  );
}
