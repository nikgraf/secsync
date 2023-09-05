export const intToUint8Array = (int: number): Uint8Array => {
  if (!Number.isSafeInteger(int)) {
    throw new Error("Number is not a safe integer");
  }

  const buffer = new ArrayBuffer(4); // an integer is 4 bytes in JavaScript
  const view = new DataView(buffer);
  view.setUint32(0, int, true); // true for little-endian
  return new Uint8Array(buffer);
};
