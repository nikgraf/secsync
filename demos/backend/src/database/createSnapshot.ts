import { prisma } from "./prisma";
import {
  Snapshot,
  NaishoSnapshotMissesUpdatesError,
  NaishoSnapshotBasedOnOutdatedSnapshotError,
} from "@naisho/core";

type ActiveSnapshotInfo = {
  latestVersion: number;
  snapshotId: string;
};

export async function createSnapshot(
  snapshot: Snapshot,
  activeSnapshotInfo?: ActiveSnapshotInfo
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

    // function sleep(ms) {
    //   return new Promise((resolve) => setTimeout(resolve, ms));
    // }
    // await sleep(3000);

    // const random = Math.floor(Math.random() * 10);
    // if (random < 8) {
    //   throw new NaishoSnapshotBasedOnOutdatedSnapshotError(
    //     "Snapshot is out of date."
    //   );
    // }

    // const random = Math.floor(Math.random() * 10);
    // if (random < 8) {
    //   throw new NaishoSnapshotMissesUpdatesError(
    //     "Snapshot does not include the latest changes."
    //   );
    // }

    if (
      document.activeSnapshot &&
      activeSnapshotInfo !== undefined &&
      document.activeSnapshot.id !== activeSnapshotInfo.snapshotId
    ) {
      throw new NaishoSnapshotBasedOnOutdatedSnapshotError(
        "Snapshot is out of date."
      );
    }
    if (
      document.activeSnapshot &&
      activeSnapshotInfo !== undefined &&
      document.activeSnapshot.latestVersion !== activeSnapshotInfo.latestVersion
    ) {
      throw new NaishoSnapshotMissesUpdatesError(
        "Snapshot does not include the latest changes."
      );
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
