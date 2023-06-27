import { SomeZodObject } from "zod";
import { EphemeralUpdate } from "../types";

export const parseEphemeralUpdate = (
  ephemeralUpdate: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawEphemeralUpdate = EphemeralUpdate.parse(ephemeralUpdate);
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
