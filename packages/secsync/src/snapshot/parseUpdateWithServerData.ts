import { SomeZodObject } from "zod";
import { UpdateWithServerData } from "../types";

export const parseUpdateWithServerData = (
  update: any,
  AdditionalValidation?: SomeZodObject
) => {
  const rawUpdate = UpdateWithServerData.parse(update);
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
