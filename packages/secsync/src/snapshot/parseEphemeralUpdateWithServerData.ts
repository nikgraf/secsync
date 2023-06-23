import { SomeZodObject } from "zod";
import { EphemeralUpdate } from "../types";

export const parseEphemeralUpdateWithServerData = (
  ephemeralUpdate: any,
  AdditionalValidation: SomeZodObject
) => {
  const rawEphemeralUpdate = EphemeralUpdate.parse(ephemeralUpdate);
  const additionalData = AdditionalValidation.parse(ephemeralUpdate.publicData);
  return {
    ...rawEphemeralUpdate,
    publicData: {
      ...additionalData,
      ...rawEphemeralUpdate.publicData,
    },
  };
};
