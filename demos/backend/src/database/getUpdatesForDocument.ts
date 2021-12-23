import { serializeSnapshot, serializeUpdates } from "../utils/serialize";
import { prisma } from "./prisma";

export async function getUpdatesForDocument(
  documentId: string,
  knownSnapshotId: string,
  knownUpdateVersion?: number
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { activeSnapshot: true },
  });
  if (document === null) {
    throw "Document not found.";
  }
  if (document.activeSnapshot === null) {
    throw "Document has no active snapshot.";
  }

  if (
    document.activeSnapshot.id === knownSnapshotId &&
    document.activeSnapshot.latestVersion === knownUpdateVersion
  ) {
    return {
      snapshot: null,
      updates: [],
    };
  } else if (
    document.activeSnapshot.id === knownSnapshotId &&
    (knownUpdateVersion === undefined || knownUpdateVersion === null)
  ) {
    const updates = await prisma.update.findMany({
      where: { snapshotId: knownSnapshotId },
      orderBy: { version: "asc" },
    });
    return {
      snapshot: null,
      updates: serializeUpdates(updates),
    };
  } else if (
    document.activeSnapshot.id === knownSnapshotId &&
    document.activeSnapshot.latestVersion > knownUpdateVersion
  ) {
    const updates = await prisma.update.findMany({
      where: {
        snapshotId: knownSnapshotId,
        version: { gt: knownUpdateVersion },
      },
      orderBy: { version: "asc" },
    });
    return {
      snapshot: null,
      updates: serializeUpdates(updates),
    };
  }

  const updates = await prisma.update.findMany({
    where: { snapshotId: document.activeSnapshot.id },
    orderBy: { version: "asc" },
  });
  return {
    snapshot: serializeSnapshot(document.activeSnapshot),
    updates: serializeUpdates(updates),
  };
}
