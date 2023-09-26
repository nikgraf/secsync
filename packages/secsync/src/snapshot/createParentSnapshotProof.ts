import canonicalize from "canonicalize";
import { hash } from "../crypto/hash";

type CreateParentSnapshotProofParams = {
  grandParentSnapshotProof: string;
  parentSnapshotId: string;
  parentSnapshotCiphertextHash: string;
  sodium: typeof import("libsodium-wrappers");
};

export function createParentSnapshotProof({
  grandParentSnapshotProof,
  parentSnapshotId,
  parentSnapshotCiphertextHash,
  sodium,
}: CreateParentSnapshotProofParams) {
  const snapshotProofData = canonicalize({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash,
  })!;
  const parentSnapshotProof = hash(snapshotProofData, sodium);
  return parentSnapshotProof;
}
