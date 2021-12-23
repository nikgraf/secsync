import { SnapshotWithServerData, UpdateWithServerData } from "@naisho/core";
import { Snapshot, Update } from "../../prisma/generated/output";

export function serializeSnapshot(snapshot: Snapshot): SnapshotWithServerData {
  return {
    ...JSON.parse(snapshot.data),
    serverData: {
      latestVersion: snapshot.latestVersion,
    },
  };
}

export function serializeUpdates(updates: Update[]): UpdateWithServerData[] {
  return updates.map((update) => {
    return {
      ...JSON.parse(update.data),
      serverData: { version: update.version },
    };
  });
}
