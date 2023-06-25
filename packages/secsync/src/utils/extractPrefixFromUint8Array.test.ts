import { extractPrefixFromUint8Array } from "./extractPrefixFromUint8Array";
test("should extract the prefix and value correctly", () => {
  const inputArray = new Uint8Array([1, 2, 3, 4, 5]);
  const amount = 2;
  const expectedResult = {
    prefix: new Uint8Array([1, 2]),
    value: new Uint8Array([3, 4, 5]),
  };

  const result = extractPrefixFromUint8Array(inputArray, amount);

  expect(result).toEqual(expectedResult);
});

test("should return an empty prefix and the original value when amount is zero", () => {
  const inputArray = new Uint8Array([1, 2, 3, 4, 5]);
  const amount = 0;
  const expectedResult = {
    prefix: new Uint8Array(),
    value: inputArray,
  };

  const result = extractPrefixFromUint8Array(inputArray, amount);

  expect(result).toEqual(expectedResult);
});

test("should return the original value as prefix and an empty value when amount equals the input array length", () => {
  const inputArray = new Uint8Array([1, 2, 3, 4, 5]);
  const amount = inputArray.length;
  const expectedResult = {
    prefix: inputArray,
    value: new Uint8Array(),
  };

  const result = extractPrefixFromUint8Array(inputArray, amount);

  expect(result).toEqual(expectedResult);
});

test("should throw an error when amount is larger than the input array length", () => {
  const inputArray = new Uint8Array([1, 2, 3, 4, 5]);
  const amount = 6;

  expect(() => {
    extractPrefixFromUint8Array(inputArray, amount);
  }).toThrowError(
    "Amount of prefix items to extract is larger than the Uint8Array"
  );
});
