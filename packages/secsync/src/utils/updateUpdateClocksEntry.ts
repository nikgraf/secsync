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
    if (
      entry.snapshotId === snapshotId &&
      // only apply the new clock if it's higher than the current one or doesn't exist
      (entry.updateClocks[clientPublicKey] === undefined ||
        (entry.updateClocks[clientPublicKey] !== undefined &&
          entry.updateClocks[clientPublicKey] < newClock))
    ) {
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
