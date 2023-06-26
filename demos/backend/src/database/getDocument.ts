import { serializeSnapshot, serializeUpdates } from "../utils/serialize";
import { prisma } from "./prisma";

type Params = {
  documentId: string;
  lastKnownSnapshotId?: string;
  lastKnownUpdateServerVersion?: number;
};

export async function getDocument({
  documentId,
  lastKnownSnapshotId,
  lastKnownUpdateServerVersion,
}: Params) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      activeSnapshot: {
        include: {
          updates: {
            orderBy: { version: "asc" },
            where: { version: { gt: lastKnownUpdateServerVersion } },
          },
        },
      },
    },
  });
  if (!doc) return null;
  if (!doc.activeSnapshot) return null;

  let snapshotProofChain: {
    id: string;
    parentSnapshotProof: string;
    ciphertextHash: string;
  }[] = [];
  if (lastKnownSnapshotId) {
    snapshotProofChain = await prisma.snapshot.findMany({
      where: { documentId },
      cursor: { id: lastKnownSnapshotId },
      skip: 1,
      select: {
        id: true,
        parentSnapshotProof: true,
        ciphertextHash: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return {
    snapshot: serializeSnapshot(doc.activeSnapshot),
    updates: serializeUpdates(doc.activeSnapshot.updates),
    snapshotProofChain: snapshotProofChain.map((snapshotProofChainEntry) => {
      return {
        id: snapshotProofChainEntry.id,
        parentSnapshotProof: snapshotProofChainEntry.parentSnapshotProof,
        snapshotCiphertextHash: snapshotProofChainEntry.ciphertextHash,
      };
    }),
  };
}
