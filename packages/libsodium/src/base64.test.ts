import * as base64wasm from "./base64wasm";
import * as base64native from "./base64native";
import sodium from "libsodium-wrappers";
declare const Buffer: any;

test("should encode libsodium-compatible base64", async () => {
  await sodium.ready;
  const testStrings = [
    "\0\x01\x02\x03\x04\x05\x06\x07\b\t\n\x0B\f\r\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1A\x1B\x1C\x1D\x1E\x1F !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7F",
    "a",
    "aa",
    "aaa",
    "foo\0",
    "foo\0\0",
    "",
    "f",
    "fo",
    "foo",
    "foob",
    "fooba",
    "fobar",
    "\xFF\xFF\xC0",
    "\0",
    "\0a",
    "\uD800\uDC00",
  ];
  for (let i = 0; i < testStrings.length; i++) {
    const testBytes = new Uint8Array(Buffer.from(testStrings[i]));
    const wasmEncodedValue = base64wasm.to_base64(testBytes);
    const mobileEncodedValue = base64native.to_base64(testBytes);
    const expectedResult = sodium.to_base64(testBytes);
    expect(wasmEncodedValue).toBe(expectedResult);
    expect(mobileEncodedValue).toBe(expectedResult);
  }
});

test("should decode libsodium-compatible base64", async () => {
  await sodium.ready;
  const testStrings = [
    "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn8=",
    "AAECA\t\n\f\r wQFBgcICQoLDA0ODx\t\n\f\r AREhMUFRYXGBkaGxwdHh8gIS\t\n\f\r IjJCUmJygpKissLS4vMDEyMzQ1Njc4OT\t\n\f\r o7PD0+P0BBQkNERUZHSElKS0xNT\t\n\f\r k9QUVJTVFVWV1hZWltcXV5fY\t\n\f\r GFiY2RlZmdoaWprbG\t\n\f\r 1ub3BxcnN0dXZ3eH\t\n\f\r l6e3x9fn8=",
    "YQ===",
    "YWE=",
    "YWFh",
    "YQ",
    // "YR", // libsodium throws 'invalid input' error
    "Zm9vIGJhciBiYXo=",
    "Zm9vIGJhcg==",
    "Zm9v",
    "Zm9vAA==",
    "Zm9vAAA=",
    "abcd",
    " abcd",
    "abcd ",
    "abcd===",
    " abcd===",
    "abcd=== ",
    "abcd === ",
    // "a",
    // "ab", // libsodium process this into []
    "abc",
    // "abcde", // invalid input
    // "\uD800\uDC00", // libsodium process this into [255, 255, 255]
    "=",
    "==",
    "===",
    "====",
    "=====",
    // "a=",
    // "a==",
    // "a===",
    // "a====",
    // "a=====",
    // "ab=", // libsodium process these into []
    // "ab===",
    // "ab====",
    // "ab=====",
    "abc=",
    "abc==",
    "abc===",
    "abc====",
    "abc=====",
    "abcd=",
    "abcd==",
    "abcd===",
    "abcd====",
    "abcd=====",
    // "abcde=", // libsodium process these into []
    // "abcde==",
    // "abcde===",
    // "abcde====",
    // "abcde=====",
    "=a=",
    "a=b",
    "a=b=",
    // "ab=c", // libsodium process these into []
    // "ab=c=", // libsodium process these into []
    // "ab=c=d", // libsodium process these into []
    // "ab=c=d=", // libsodium process these into []
    "ab\tcd",
    "ab\ncd",
    "ab\fcd",
    "ab\rcd",
    "ab cd",
    "ab\xA0cd",
    "ab\t\n\f\r cd",
    " \t\n\f\r ab\t\n\f\r cd\t\n\f\r ",
    "ab\t\n\f\r =\t\n\f\r =\t\n\f\r ",
    // "A",
    "/A",
    "//A",
    "///A",
    // "////A", // libsodium throws an "invalid input" error
    // "/",
    // "A/", // libsodium throws an "invalid input" error
    // "AA/", // libsodium throws an "invalid input" error
    "AAA/",
    // "AAAA/", // libsodium throws an "invalid input" error
    "\0",
    "\0nonsense",
    "abcd\0nonsense",
  ];
  for (let i = 0; i < testStrings.length; i++) {
    const testString = testStrings[i]
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    let wasmDecodedValue = new Array();
    let nativeDecodedValue = new Array();
    let expectedResult = new Array();
    let wasmLocalError = "";
    let nativeLocalError = "";
    let sodiumError = "";
    try {
      wasmDecodedValue = Array.from(base64wasm.from_base64(testString));
    } catch (error) {
      wasmLocalError = error.name;
    }
    try {
      nativeDecodedValue = Array.from(base64native.from_base64(testString));
    } catch (error) {
      nativeLocalError = error.name;
    }
    try {
      expectedResult = Array.from(sodium.from_base64(testString));
    } catch (error) {
      sodiumError = error.name;
    }

    // const originalTestString = testStrings[i];
    // console.log(
    //   originalTestString,
    //   nativeDecodedValue,
    //   wasmDecodedValue,
    //   nativeLocalError,
    //   sodiumError
    // );
    expect(wasmLocalError).toEqual(sodiumError);
    expect(nativeLocalError).toEqual(sodiumError);
    expect(wasmDecodedValue).toEqual(expect.arrayContaining(expectedResult));
    expect(nativeDecodedValue).toEqual(expect.arrayContaining(expectedResult));
  }
});

test("should decode libsodium-compatible base64 to a string", async () => {
  await sodium.ready;

  expect(base64wasm.from_base64_to_string("SGVsbG8")).toEqual("Hello");
  expect(base64native.from_base64_to_string("SGVsbG8")).toEqual("Hello");
  expect(base64wasm.from_base64_to_string("w7_Dv8OA")).toEqual("\xFF\xFF\xC0");
  expect(base64native.from_base64_to_string("w7_Dv8OA")).toEqual(
    "\xFF\xFF\xC0"
  );
});
