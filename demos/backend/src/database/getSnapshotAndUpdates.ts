import { serializeSnapshot, serializeUpdates } from "../utils/serialize";
import { prisma } from "./prisma";

type Params = {
  documentId: string;
  knownSnapshotId: string;
  knownUpdateVersion?: number;
};

export async function getSnapshotAndUpdates({
  documentId,
  knownSnapshotId,
  knownUpdateVersion,
}: Params) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { activeSnapshot: true },
  });
  if (document.activeSnapshot === null) {
    throw new Error("Document has no active snapshot.");
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
