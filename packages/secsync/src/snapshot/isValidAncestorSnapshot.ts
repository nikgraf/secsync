import canonicalize from "canonicalize";
import { hash } from "../crypto/hash";
import { Snapshot } from "../types";

export type SnapshotProofChainEntry = {
  parentSnapshotProof: string;
  snapshotId: string;
  snapshotCiphertextHash: string;
};

type IsValidAncestorSnapshotParams = {
  knownSnapshotProofEntry: SnapshotProofChainEntry;
  snapshotProofChain: SnapshotProofChainEntry[];
  currentSnapshot: Snapshot;
  sodium: typeof import("libsodium-wrappers");
};

type CreateParentSnapshotProofBasedOnHashParams = {
  grandParentSnapshotProof: string;
  parentSnapshotId: string;
  parentSnapshotCiphertextHash: string;
  sodium: typeof import("libsodium-wrappers");
};

export function createParentSnapshotProofBasedOnHash({
  grandParentSnapshotProof,
  parentSnapshotId,
  parentSnapshotCiphertextHash,
  sodium,
}: CreateParentSnapshotProofBasedOnHashParams) {
  const snapshotProofData = canonicalize({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertext: parentSnapshotCiphertextHash,
  })!;
  const parentSnapshotProof = hash(snapshotProofData, sodium);
  return parentSnapshotProof;
}

export function isValidAncestorSnapshot({
  knownSnapshotProofEntry,
  snapshotProofChain,
  currentSnapshot,
  sodium,
}: IsValidAncestorSnapshotParams) {
  let isValid = true;
  if (snapshotProofChain.length === 0) {
    return false;
  }

  // check the first entry with the known entry
  const known = createParentSnapshotProofBasedOnHash({
    grandParentSnapshotProof: knownSnapshotProofEntry.parentSnapshotProof,
    parentSnapshotId: knownSnapshotProofEntry.snapshotId,
    parentSnapshotCiphertextHash:
      knownSnapshotProofEntry.snapshotCiphertextHash,
    sodium,
  });
  if (
    snapshotProofChain.length > 0 &&
    snapshotProofChain[0].parentSnapshotProof !== known
  ) {
    return false;
  }

  // check that the last chain entry matches the current snapshot
  if (
    snapshotProofChain[snapshotProofChain.length - 1].parentSnapshotProof !==
      currentSnapshot.publicData.parentSnapshotProof ||
    snapshotProofChain[snapshotProofChain.length - 1].snapshotCiphertextHash !==
      hash(currentSnapshot.ciphertext, sodium)
  ) {
    return false;
  }

  // check all items in between
  snapshotProofChain.forEach((snapshotProofChainEntry, index) => {
    const { parentSnapshotProof, snapshotCiphertextHash, snapshotId } =
      snapshotProofChainEntry;
    const parentSnapshotProofBasedOnHash = createParentSnapshotProofBasedOnHash(
      {
        grandParentSnapshotProof: parentSnapshotProof,
        parentSnapshotId: snapshotId,
        parentSnapshotCiphertextHash: snapshotCiphertextHash,
        sodium,
      }
    );
    if (
      index < snapshotProofChain.length - 1 &&
      parentSnapshotProofBasedOnHash !==
        snapshotProofChain[index + 1].parentSnapshotProof
    ) {
      isValid = false;
    }
  });

  return isValid;
}
