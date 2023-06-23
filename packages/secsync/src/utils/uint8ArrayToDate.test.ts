import { dateToUint8Array } from "./dateToUint8Array";
import { uint8ArrayToDate } from "./uint8ArrayToDate";

test("converts the Unix epoch to a Date", () => {
  const date = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
  const expectedResult = new Date(0); // The Unix epoch (January 1, 1970 00:00:00 UTC);
  const result = uint8ArrayToDate(date);
  expect(result).toEqual(expectedResult);
});

test("converts 2000-01-01T00:00:00.000Z to a Date", () => {
  const date = new Uint8Array([0, 0, 0, 220, 106, 207, 172, 0]);
  const expectedResult = new Date("2000-01-01T00:00:00.000Z");
  const result = uint8ArrayToDate(date);
  expect(result).toEqual(expectedResult);
});

test("converts 2020-06-15T12:34:56.000Z to a Date", () => {
  const date = new Uint8Array([0, 0, 1, 114, 183, 249, 185, 128]);
  const expected = new Date("2020-06-15T12:34:56.000Z");
  const result = uint8ArrayToDate(date);
  expect(result).toEqual(expected);
});

test("converts 2000-01-01T00:00:00.000Z to a Date", () => {
  const date = dateToUint8Array(new Date("2000-01-01T00:00:00.000Z"));
  const expectedResult = new Date("2000-01-01T00:00:00.000Z");
  const result = uint8ArrayToDate(date);
  expect(result).toEqual(expectedResult);
});
