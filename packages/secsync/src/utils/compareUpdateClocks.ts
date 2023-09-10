import { SnapshotClocks } from "../types";

export const compareUpdateClocks = (
  updateClocksServer: SnapshotClocks,
  updateClocksClient: SnapshotClocks
): { equal: boolean; missing: SnapshotClocks } => {
  const clocksServer = SnapshotClocks.parse(updateClocksServer);
  const clocksClient = SnapshotClocks.parse(updateClocksClient);

  const keysServer = Object.keys(clocksServer);
  const keysClient = Object.keys(clocksClient);

  const equal =
    keysServer.every((key) => clocksClient[key] === clocksServer[key]) &&
    keysClient.every((key) => clocksServer[key] === clocksClient[key]);

  if (equal) {
    return { equal, missing: {} };
  }

  const missing = keysServer.reduce((acc: SnapshotClocks, key) => {
    return clocksServer[key] === undefined ||
      clocksServer[key] !== clocksClient[key]
      ? { ...acc, [key]: clocksClient[key] || 0 }
      : acc;
  }, {});

  return { equal, missing };
};
