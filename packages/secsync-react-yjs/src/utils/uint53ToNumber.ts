export function uint53ToNumber(uint8Array: Uint8Array) {
  if (uint8Array.length < 7) {
    throw new Error("Array must have at least 7 bytes");
  }

  // create DataView from Uint8Array
  const view = new DataView(uint8Array.buffer);

  // read the first 6 bytes as-is
  const low = view.getUint32(0, true); // true for little-endian
  const mid = view.getUint16(4, true);

  // mask the last byte to get only the first 5 bits
  const high = view.getUint8(6) & 0x1f; // 0x1F = 0001 1111 in binary

  // construct the 53-bit number (high:5 bits, mid:16 bits, low:32 bits)
  const num = high * Math.pow(2, 48) + mid * Math.pow(2, 32) + low;

  return num;
}
