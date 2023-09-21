import { SnapshotInfoWithUpdateClocks } from "../types";

type Params = {
  snapshotInfosWithUpdateClocks: SnapshotInfoWithUpdateClocks[];
  snapshotId: string;
  clientPublicKey: string;
  newClock: number;
};

export const updateUpdateClocksEntry = ({
  snapshotInfosWithUpdateClocks,
  snapshotId,
  clientPublicKey,
  newClock,
}: Params) => {
  return snapshotInfosWithUpdateClocks.map((entry) => {
    if (entry.snapshot.publicData.snapshotId === snapshotId) {
      return {
        ...entry,
        updateClocks: {
          ...entry.updateClocks,
          [clientPublicKey]: newClock,
        },
      };
    }
    return entry;
  });
};
