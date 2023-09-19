import { SnapshotUpdatesClocks } from "../types";

export const compareUpdatesClocks = (
  updateClocksServer: SnapshotUpdatesClocks,
  updateClocksClient: SnapshotUpdatesClocks
): { equal: boolean; missing: SnapshotUpdatesClocks } => {
  const clocksServer = SnapshotUpdatesClocks.parse(updateClocksServer);
  const clocksClient = SnapshotUpdatesClocks.parse(updateClocksClient);

  const keysServer = Object.keys(clocksServer);
  const keysClient = Object.keys(clocksClient);

  const equal =
    keysServer.every((key) => clocksClient[key] === clocksServer[key]) &&
    keysClient.every((key) => clocksServer[key] === clocksClient[key]);

  if (equal) {
    return { equal, missing: {} };
  }

  const missing = keysServer.reduce((acc: SnapshotUpdatesClocks, key) => {
    return clocksServer[key] === undefined ||
      clocksServer[key] !== clocksClient[key]
      ? { ...acc, [key]: clocksClient[key] || 0 }
      : acc;
  }, {});

  return { equal, missing };
};
