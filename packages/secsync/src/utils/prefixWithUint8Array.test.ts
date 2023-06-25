import { prefixWithUint8Array } from "./prefixWithUint8Array";

const prefix = new Uint8Array([1, 2, 3]);

test("concatenates prefix and string", () => {
  const value = "test";
  const expectedResult = "\x01\x02\x03test";

  const result = prefixWithUint8Array(value, prefix);
  expect(result).toBe(expectedResult);
});

test("concatenates prefix and Uint8Array", () => {
  const value = new Uint8Array([4, 5, 6]);
  const expectedResult = new Uint8Array([1, 2, 3, 4, 5, 6]);

  const result = prefixWithUint8Array(value, prefix);
  expect(result).toEqual(expectedResult);
});

test("returns empty string with empty string and empty prefix", () => {
  const value = "";
  const emptyPrefix = new Uint8Array([]);

  const result = prefixWithUint8Array(value, emptyPrefix);
  expect(result).toBe("");
});

test("returns empty Uint8Array with empty Uint8Array and empty prefix", () => {
  const value = new Uint8Array([]);
  const emptyPrefix = new Uint8Array([]);

  const result = prefixWithUint8Array(value, emptyPrefix);
  expect(result).toEqual(new Uint8Array([]));
});
