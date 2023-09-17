import canonicalize from "canonicalize";
import { hash } from "../crypto/hash";

type CreateParentSnapshotProofParams = {
  grandParentSnapshotProof: string;
  parentSnapshotId: string;
  parentSnapshotCiphertext: string;
  sodium: typeof import("libsodium-wrappers");
};

export function createParentSnapshotProof({
  grandParentSnapshotProof,
  parentSnapshotId,
  parentSnapshotCiphertext,
  sodium,
}: CreateParentSnapshotProofParams) {
  const snapshotProofData = canonicalize({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertext: hash(parentSnapshotCiphertext, sodium),
  })!;
  const parentSnapshotProof = hash(snapshotProofData, sodium);
  return parentSnapshotProof;
}
