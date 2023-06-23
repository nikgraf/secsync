import canonicalize from "canonicalize";
import { hash } from "../crypto/hash";

type CreateParentSnapshotProofParams = {
  grandParentSnapshotProof: string;
  parentSnapshotCiphertext: string;
  sodium: typeof import("libsodium-wrappers");
};

export function createParentSnapshotProof({
  grandParentSnapshotProof,
  parentSnapshotCiphertext,
  sodium,
}: CreateParentSnapshotProofParams) {
  const snapshotProofData = canonicalize({
    grandParentSnapshotProof,
    parentSnapshotCiphertext: hash(parentSnapshotCiphertext, sodium),
  })!;
  const parentSnapshotProof = hash(snapshotProofData, sodium);
  return parentSnapshotProof;
}
