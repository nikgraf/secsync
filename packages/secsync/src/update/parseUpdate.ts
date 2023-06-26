import { SomeZodObject } from "zod";
import { Update } from "../types";

export const parseUpdate = (
  update: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawUpdate = Update.parse(update);
  if (AdditionalValidation === undefined) return rawUpdate;
  const additionalData = AdditionalValidation.parse(update.publicData);
  return {
    ...rawUpdate,
    publicData: {
      ...additionalData,
      ...rawUpdate.publicData,
    },
  };
};
