import { SomeZodObject } from "zod";
import { Snapshot } from "../types";

export const parseSnapshot = (
  snapshot: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawSnapshot = Snapshot.parse(snapshot);
  if (AdditionalValidation === undefined) return rawSnapshot;
  const additionalData = AdditionalValidation.parse(snapshot.publicData);
  return {
    ...rawSnapshot,
    publicData: {
      ...additionalData,
      ...rawSnapshot.publicData,
    },
  };
};
