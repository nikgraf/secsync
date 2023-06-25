import { dateToUint8Array } from "./dateToUint8Array";

test("returns an 8-byte Uint8Array", () => {
  const date = new Date();
  const result = dateToUint8Array(date);
  expect(result).toBeInstanceOf(Uint8Array);
  expect(result.length).toBe(8);
});

test("converts the Unix epoch to a Uint8Array", () => {
  const date = new Date(0); // The Unix epoch (January 1, 1970 00:00:00 UTC)
  const expectedResult = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
  const result = dateToUint8Array(date);
  expect(result).toEqual(expectedResult);
});

test("converts 2000-01-01T00:00:00.000Z to a Uint8Array", () => {
  const date = new Date("2000-01-01T00:00:00.000Z");
  const expectedResult = new Uint8Array([0, 0, 0, 220, 106, 207, 172, 0]);
  const result = dateToUint8Array(date);
  expect(result).toEqual(expectedResult);
});

test("converts 2020-06-15T12:34:56.000Z to a Uint8Array", () => {
  const date = new Date("2020-06-15T12:34:56.000Z");
  const expected = new Uint8Array([0, 0, 1, 114, 183, 249, 185, 128]);
  const result = dateToUint8Array(date);
  expect(result).toEqual(expected);
});
