import { SomeZodObject } from "zod";
import { SnapshotWithServerData } from "../types";

export const parseSnapshotWithServerData = (
  snapshot: any,
  AdditionalValidation: SomeZodObject
) => {
  const rawSnapshot = SnapshotWithServerData.parse(snapshot);
  const additionalData = AdditionalValidation.parse(snapshot.publicData);
  return {
    ...rawSnapshot,
    publicData: {
      ...additionalData,
      ...rawSnapshot.publicData,
    },
  };
};
