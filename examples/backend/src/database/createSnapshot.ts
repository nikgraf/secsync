import sodium from "libsodium-wrappers";
import {
  CreateSnapshotParams,
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
  compareUpdatesClocks,
  hash,
} from "secsync";
import { serializeSnapshot } from "../utils/serialize";
import { Prisma, prisma } from "./prisma";

export async function createSnapshot({ snapshot }: CreateSnapshotParams) {
  return await prisma.$transaction(
    async (prisma) => {
      const document = await prisma.document.findUniqueOrThrow({
        where: { id: snapshot.publicData.docId },
        select: {
          activeSnapshot: true,
        },
      });

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

      if (document.activeSnapshot) {
        if (
          snapshot.publicData.parentSnapshotId !== undefined &&
          snapshot.publicData.parentSnapshotId !== document.activeSnapshot.id
        ) {
          throw new SecsyncSnapshotBasedOnOutdatedSnapshotError(
            "Snapshot is out of date."
          );
        }

        const compareUpdatesClocksResult = compareUpdatesClocks(
          // @ts-expect-error the values are parsed by the function
          document.activeSnapshot.clocks,
          snapshot.publicData.parentSnapshotUpdatesClocks
        );

        if (!compareUpdatesClocksResult.equal) {
          throw new SecsyncSnapshotMissesUpdatesError(
            "Snapshot does not include the latest changes."
          );
        }
      }

      const newSnapshot = await prisma.snapshot.create({
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
          parentSnapshotUpdatesClocks:
            snapshot.publicData.parentSnapshotUpdatesClocks,
        },
      });

      return serializeSnapshot(newSnapshot);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    }
  );
}
