import { SnapshotUpdatesClocks } from "../types";

export const compareUpdatesClocks = (
  updatesClocksServer: SnapshotUpdatesClocks,
  updatesClocksClient: SnapshotUpdatesClocks
): { equal: boolean; missing: SnapshotUpdatesClocks } => {
  const clocksServer = SnapshotUpdatesClocks.parse(updatesClocksServer);
  const clocksClient = SnapshotUpdatesClocks.parse(updatesClocksClient);

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
