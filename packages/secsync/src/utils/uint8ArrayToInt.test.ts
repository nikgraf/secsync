import { intToUint8Array } from "./intToUint8Array";
import { uint8ArrayToNumber } from "./uint8ArrayToInt";

test("convert 42 to Uint8Array", () => {
  const uint8 = intToUint8Array(42);
  expect(uint8ArrayToNumber(uint8)).toEqual(42);
});

test("convert 0 to Uint8Array", () => {
  const uint8 = intToUint8Array(0);
  expect(uint8ArrayToNumber(uint8)).toEqual(0);
});

test("convert 3000575 to Uint8Array", () => {
  const uint8 = intToUint8Array(3000575);
  expect(uint8ArrayToNumber(uint8)).toEqual(3000575);
});
