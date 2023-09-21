import { GetDocumentParams } from "packages/secsync/src";
import { serializeSnapshot, serializeUpdates } from "../utils/serialize";
import { prisma } from "./prisma";

export async function getOrCreateDocument({
  documentId,
  lastKnownSnapshotId,
  lastKnownSnapshotUpdateClocks,
}: GetDocumentParams) {
  return prisma.$transaction(async (prisma) => {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { activeSnapshot: { select: { id: true } } },
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
    if (lastKnownSnapshotId && lastKnownSnapshotId !== doc.activeSnapshot.id) {
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

    let lastKnownVersion: number | undefined = undefined;
    // in case the last known snapshot is the current one, try to find the lastKnownVersion number
    if (lastKnownSnapshotId === doc.activeSnapshot.id) {
      const updateIds = Object.entries(lastKnownSnapshotUpdateClocks).map(
        ([pubKey, clock]) => {
          return `${lastKnownSnapshotId}-${pubKey}-${clock}`;
        }
      );
      const lastUpdate = await prisma.update.findFirst({
        where: {
          id: { in: updateIds },
        },
        orderBy: { version: "desc" },
      });
      if (lastUpdate) {
        lastKnownVersion = lastUpdate.version;
      }
    }

    // fetch the active snapshot with
    // - all updates after the last known version if there is one and
    // - all updates if there is none
    const activeSnapshot = await prisma.snapshot.findUnique({
      where: { id: doc.activeSnapshot.id },
      include: {
        updates:
          lastKnownVersion !== undefined
            ? {
                orderBy: { version: "asc" },
                where: {
                  version: { gt: lastKnownVersion },
                },
              }
            : {
                orderBy: { version: "asc" },
              },
      },
    });

    return {
      snapshot: serializeSnapshot(activeSnapshot),
      updates: serializeUpdates(activeSnapshot.updates),
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
