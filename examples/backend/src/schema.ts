import { makeSchema } from "nexus";
import path from "path";
import { Query } from "./graphql/Query";

export const schema = makeSchema({
  plugins: [],
  types: [Query],
  outputs: {
    schema: path.join(__dirname, "/generated/schema.graphql"),
    typegen: path.join(__dirname, "/generated/typings.ts"),
  },
});
