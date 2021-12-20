import { prisma } from "./prisma";
import { SnapshotWithServerData, UpdateWithServerData } from "@naisho/core";

export async function getDocument(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      activeSnapshot: {
        include: { updates: { orderBy: { version: "asc" } } },
      },
    },
  });
  if (!doc) return null;

  const snapshot: SnapshotWithServerData = doc.activeSnapshot
    ? {
        ...JSON.parse(doc.activeSnapshot.data),
        serverData: {
          latestVersion: doc.activeSnapshot.latestVersion,
        },
      }
    : null;

  const updates: UpdateWithServerData[] = doc.activeSnapshot
    ? doc.activeSnapshot.updates.map((update) => {
        return {
          ...JSON.parse(update.data),
          serverData: { version: update.version },
        };
      })
    : [];

  return {
    doc: { id: doc.id },
    snapshot,
    updates,
  };
}
