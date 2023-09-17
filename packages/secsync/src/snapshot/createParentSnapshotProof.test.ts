import sodium from "libsodium-wrappers";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

const grandParentSnapshotProof = "abc";
const parentSnapshotCiphertext = "cde";
const parentSnapshotId = "efg";

test("it returns a valid proof", () => {
  const parentSnapshotProof = createParentSnapshotProof({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertext,
    sodium,
  });

  expect(parentSnapshotProof).toEqual(
    "Ie6yLlPGfPeNKANa7OOHbYKQbLfFAw9EAoIuVI1N9MY"
  );
});
