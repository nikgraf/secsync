import sodium from "libsodium-wrappers";
import { serializeUint8ArrayUpdates } from "./serializeUint8ArrayUpdates";

test("serializes an array of Uint8Array updates to a JSON string of base64-encoded strings", () => {
  const update1 = new Uint8Array([1, 2, 3]);
  const update2 = new Uint8Array([4, 5, 6]);
  const serialized = serializeUint8ArrayUpdates([update1, update2], sodium);
  expect(serialized).toEqual(
    JSON.stringify([sodium.to_base64(update1), sodium.to_base64(update2)])
  );
});
