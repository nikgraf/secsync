import { prisma } from "./prisma";
import { Snapshot } from "@naisho/core";

export async function createSnapshot(
  snapshot: Snapshot,
  latestVersionFromPrevSnapshot?: number
) {
  return await prisma.$transaction(async (prisma) => {
    const document = await prisma.document.findUnique({
      where: { id: snapshot.publicData.docId },
      select: {
        activeSnapshot: true,
      },
    });
    if (!document) {
      throw new Error("Document doesn't exist.");
    }
    if (
      document.activeSnapshot &&
      document.activeSnapshot.latestVersion !== latestVersionFromPrevSnapshot
    ) {
      throw new Error("Snapshot does not include the latest changes.");
    }

    return await prisma.snapshot.create({
      data: {
        id: snapshot.publicData.snapshotId,
        latestVersion: 0,
        preview: "",
        data: JSON.stringify(snapshot),
        activeSnapshotDocument: {
          connect: { id: snapshot.publicData.docId },
        },
        document: { connect: { id: snapshot.publicData.docId } },
        clocks: {},
      },
    });
  });
}
