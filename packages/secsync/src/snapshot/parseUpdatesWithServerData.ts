import { SomeZodObject } from "zod";
import { parseUpdateWithServerData } from "./parseUpdateWithServerData";

export const parseUpdatesWithServerData = (
  updates: any[],
  AdditionalValidation?: SomeZodObject
) => {
  return updates.map((update) => {
    return parseUpdateWithServerData(update, AdditionalValidation);
  });
};
