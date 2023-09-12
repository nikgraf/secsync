import { GetDocumentParams } from "packages/secsync/src";
import { serializeSnapshot, serializeUpdates } from "../utils/serialize";
import { prisma } from "./prisma";

export async function getOrCreateDocument({
  documentId,
  lastKnownSnapshotId,
}: GetDocumentParams) {
  return prisma.$transaction(async (prisma) => {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        activeSnapshot: {
          include: {
            updates: {
              orderBy: { version: "asc" },
            },
          },
        },
      },
    });
    if (!doc) {
      await prisma.document.create({
        data: { id: documentId },
      });
      return {
        updates: [],
        snapshotProofChain: [],
      };
    }
    if (!doc.activeSnapshot) {
      return {
        updates: [],
        snapshotProofChain: [],
      };
    }

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
  });
}
