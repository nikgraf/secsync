import { hash } from "../crypto/hash";
import { Snapshot, SnapshotProofChainEntry } from "../types";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

type IsValidAncestorSnapshotParams = {
  knownSnapshotProofEntry: SnapshotProofChainEntry;
  snapshotProofChain: SnapshotProofChainEntry[];
  currentSnapshot: Snapshot;
  sodium: typeof import("libsodium-wrappers");
};

export function isValidAncestorSnapshot({
  knownSnapshotProofEntry,
  snapshotProofChain,
  currentSnapshot,
  sodium,
}: IsValidAncestorSnapshotParams) {
  let isValid = true;

  if (
    knownSnapshotProofEntry.snapshotId ===
      currentSnapshot.publicData.snapshotId &&
    knownSnapshotProofEntry.snapshotCiphertextHash ===
      hash(currentSnapshot.ciphertext, sodium) &&
    knownSnapshotProofEntry.parentSnapshotProof ===
      currentSnapshot.publicData.parentSnapshotProof
  ) {
    return true;
  }

  if (!Array.isArray(snapshotProofChain)) {
    return false;
  }

  if (snapshotProofChain.length === 0) {
    return false;
  }

  // check the first entry with the known entry
  const known = createParentSnapshotProof({
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
      hash(currentSnapshot.ciphertext, sodium) ||
    snapshotProofChain[snapshotProofChain.length - 1].snapshotId !==
      currentSnapshot.publicData.snapshotId
  ) {
    return false;
  }

  // check all items in between
  snapshotProofChain.forEach((snapshotProofChainEntry, index) => {
    const { parentSnapshotProof, snapshotCiphertextHash, snapshotId } =
      snapshotProofChainEntry;
    const parentSnapshotProofBasedOnHash = createParentSnapshotProof({
      grandParentSnapshotProof: parentSnapshotProof,
      parentSnapshotId: snapshotId,
      parentSnapshotCiphertextHash: snapshotCiphertextHash,
      sodium,
    });
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
