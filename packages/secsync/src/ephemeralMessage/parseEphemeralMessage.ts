import { SomeZodObject } from "zod";
import { EphemeralMessage } from "../types";

export const parseEphemeralMessage = (
  ephemeralMessage: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawEphemeralMessage = EphemeralMessage.parse(ephemeralMessage);
  if (AdditionalValidation === undefined) return rawEphemeralMessage;
  const additionalData = AdditionalValidation.parse(
    ephemeralMessage.publicData
  );
  return {
    ...rawEphemeralMessage,
    publicData: {
      ...additionalData,
      ...rawEphemeralMessage.publicData,
    },
  };
};
