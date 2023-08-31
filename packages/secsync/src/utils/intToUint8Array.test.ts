import { intToUint8Array } from "./intToUint8Array";

test("convert 42 to Uint8Array", () => {
  const uint8 = intToUint8Array(42);
  expect(uint8).toEqual(new Uint8Array([42, 0, 0, 0]));
});

test("convert 256 to Uint8Array", () => {
  const uint8 = intToUint8Array(256);
  expect(uint8).toEqual(new Uint8Array([0, 1, 0, 0]));
});

test("convert 0 to Uint8Array", () => {
  const uint8 = intToUint8Array(0);
  expect(uint8).toEqual(new Uint8Array([0, 0, 0, 0]));
});

test("convert 3000575 to Uint8Array", () => {
  const uint8 = intToUint8Array(3000575);
  expect(uint8).toEqual(new Uint8Array([255, 200, 45, 0]));
});
