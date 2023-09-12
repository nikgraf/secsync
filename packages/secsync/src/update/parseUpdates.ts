import { SomeZodObject } from "zod";
import { parseUpdate } from "./parseUpdate";

export const parseUpdates = (
  updates: any[],
  AdditionalValidation?: SomeZodObject
) => {
  return updates.map((update) => {
    return parseUpdate(update, AdditionalValidation);
  });
};
