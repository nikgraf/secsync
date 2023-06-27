import { SomeZodObject } from "zod";
import { Update } from "../types";

export const parseEphemeralUpdate = (
  ephemeralUpdate: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawEphemeralUpdate = Update.parse(ephemeralUpdate);
  if (AdditionalValidation === undefined) return rawEphemeralUpdate;
  const additionalData = AdditionalValidation.parse(ephemeralUpdate.publicData);
  return {
    ...rawEphemeralUpdate,
    publicData: {
      ...additionalData,
      ...rawEphemeralUpdate.publicData,
    },
  };
};
