import sodium from "libsodium-wrappers";
import { deserializeUint8ArrayUpdates } from "./deserializeUint8ArrayUpdates";
import { serializeUint8ArrayUpdates } from "./serializeUint8ArrayUpdates";

test("should deserialize a single Uint8Array correctly", () => {
  const array = new Uint8Array([0, 1, 2, 3]);
  const serialized = serializeUint8ArrayUpdates([array], sodium);
  const deserialized = deserializeUint8ArrayUpdates(serialized, sodium);
  expect(deserialized.length).toBe(1);
  expect(deserialized[0]).toEqual(array);
});

test("should deserialize multiple Uint8Arrays correctly", () => {
  const array1 = new Uint8Array([0, 1, 2, 3]);
  const array2 = new Uint8Array([4, 5, 6]);
  const serialized = serializeUint8ArrayUpdates([array1, array2], sodium);
  const deserialized = deserializeUint8ArrayUpdates(serialized, sodium);
  expect(deserialized.length).toBe(2);
  expect(deserialized[0]).toEqual(array1);
  expect(deserialized[1]).toEqual(array2);
});

test("should throw an error if the serialized string is invalid", () => {
  expect(() => deserializeUint8ArrayUpdates("invalid", sodium)).toThrowError();
});
