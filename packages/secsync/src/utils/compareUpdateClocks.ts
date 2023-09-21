import { SnapshotUpdateClocks } from "../types";

export const compareUpdateClocks = (
  updateClocksServer: SnapshotUpdateClocks,
  updateClocksClient: SnapshotUpdateClocks
): { equal: boolean; missing: SnapshotUpdateClocks } => {
  const clocksServer = SnapshotUpdateClocks.parse(updateClocksServer);
  const clocksClient = SnapshotUpdateClocks.parse(updateClocksClient);

  const keysServer = Object.keys(clocksServer);
  const keysClient = Object.keys(clocksClient);

  const equal =
    keysServer.every((key) => clocksClient[key] === clocksServer[key]) &&
    keysClient.every((key) => clocksServer[key] === clocksClient[key]);

  if (equal) {
    return { equal, missing: {} };
  }

  const missing = keysServer.reduce((acc: SnapshotUpdateClocks, key) => {
    return clocksServer[key] === undefined ||
      clocksServer[key] !== clocksClient[key]
      ? { ...acc, [key]: clocksClient[key] || 0 }
      : acc;
  }, {});

  return { equal, missing };
};
