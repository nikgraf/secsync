import { SomeZodObject } from "zod";
import { Snapshot } from "../types";

export const parseSnapshot = (
  snapshot: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawSnapshot = Snapshot.parse(snapshot);
  if (AdditionalValidation === undefined) return { snapshot: rawSnapshot };
  const additionalPublicData = AdditionalValidation.parse(snapshot.publicData);
  return {
    snapshot: {
      ...rawSnapshot,
      publicData: {
        ...additionalPublicData,
        ...rawSnapshot.publicData,
      },
    },
    additionalPublicData,
  };
};
