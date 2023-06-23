import sodium from "libsodium-wrappers";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

const grandParentSnapshotProof = "abc";
const parentSnapshotCiphertext = "cde";

test("it returns a valid proof", () => {
  const parentSnapshotProof = createParentSnapshotProof({
    grandParentSnapshotProof,
    parentSnapshotCiphertext,
    sodium,
  });

  expect(parentSnapshotProof).toEqual(
    "mKrictj1UUr_hkqYpO9cAw_MeZe9IDTi7une4tPjasg"
  );
});
