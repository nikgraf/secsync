import { numberToUint53 } from "./numberToUint53";
import { uint53ToNumber } from "./uint53ToNumber";

test("uint53ToNumber / numberToUint53", () => {
  expect(uint53ToNumber(numberToUint53(0))).toBe(0);
  expect(uint53ToNumber(numberToUint53(1))).toBe(1);
  expect(uint53ToNumber(numberToUint53(1000))).toBe(1000);
  expect(uint53ToNumber(numberToUint53(333))).toBe(333);
  expect(uint53ToNumber(numberToUint53(123456789))).toBe(123456789);
  expect(uint53ToNumber(numberToUint53(123456789123456))).toBe(123456789123456);
  expect(uint53ToNumber(numberToUint53(Number.MAX_SAFE_INTEGER))).toBe(
    Number.MAX_SAFE_INTEGER
  );
});
