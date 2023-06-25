import sodium from "libsodium-wrappers";
import {
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
  Snapshot,
  hash,
} from "secsync";
import { prisma } from "./prisma";

type ActiveSnapshotInfo = {
  latestVersion: number;
  snapshotId: string;
};

type CreateSnapshotParams = {
  snapshot: Snapshot;
  activeSnapshotInfo?: ActiveSnapshotInfo;
};

export async function createSnapshot({
  snapshot,
  activeSnapshotInfo,
}: CreateSnapshotParams) {
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
    //   throw new SecsyncSnapshotBasedOnOutdatedSnapshotError(
    //     "Snapshot is out of date."
    //   );
    // }

    // const random = Math.floor(Math.random() * 10);
    // if (random < 8) {
    //   throw new SecsyncSnapshotMissesUpdatesError(
    //     "Snapshot does not include the latest changes."
    //   );
    // }

    if (
      document.activeSnapshot &&
      activeSnapshotInfo !== undefined &&
      document.activeSnapshot.id !== activeSnapshotInfo.snapshotId
    ) {
      throw new SecsyncSnapshotBasedOnOutdatedSnapshotError(
        "Snapshot is out of date."
      );
    }
    if (
      document.activeSnapshot &&
      activeSnapshotInfo !== undefined &&
      document.activeSnapshot.latestVersion !== activeSnapshotInfo.latestVersion
    ) {
      throw new SecsyncSnapshotMissesUpdatesError(
        "Snapshot does not include the latest changes."
      );
    }

    return await prisma.snapshot.create({
      data: {
        id: snapshot.publicData.snapshotId,
        latestVersion: 0,
        data: JSON.stringify(snapshot),
        ciphertextHash: hash(snapshot.ciphertext, sodium),
        activeSnapshotDocument: {
          connect: { id: snapshot.publicData.docId },
        },
        document: { connect: { id: snapshot.publicData.docId } },
        clocks: {},
        parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
        // TODO additionally could verify that the parentSnapshotClocks of the saved parent snapshot
        parentSnapshotClocks: snapshot.publicData.parentSnapshotClocks,
      },
    });
  });
}
