import sodium from "libsodium-wrappers";
import { hash } from "../crypto/hash";
import { createParentSnapshotProof } from "./createParentSnapshotProof";

const grandParentSnapshotProof = "abc";
const parentSnapshotCiphertext = "cde";
const parentSnapshotId = "efg";

test("it returns a valid proof", () => {
  const parentSnapshotProof = createParentSnapshotProof({
    grandParentSnapshotProof,
    parentSnapshotId,
    parentSnapshotCiphertextHash: hash("abc", sodium),
    sodium,
  });

  expect(parentSnapshotProof).toEqual(
    "qxgOve6L8OoCogYaKEGF65vkPa7Gq2-DFsQbjwhXcIQ"
  );
});
