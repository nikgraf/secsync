export function numberToUint53(number: number) {
  const uint8Array = new Uint8Array(7);
  const view = new DataView(uint8Array.buffer);

  // decompose 53-bit number to 5-bit high, 16-bit mid, and 32-bit low
  const low = number & 0xffffffff; // Mask to get lowest 32 bits
  const mid = (number / Math.pow(2, 32)) & 0xffff; // Shift right 32 and mask to get next 16 bits
  const high = (number / Math.pow(2, 48)) & 0x1f; // Shift right 48 and mask to get highest 5 bits

  // write to DataView
  view.setUint32(0, low, true); // true for little-endian
  view.setUint16(4, mid, true);
  view.setUint8(6, high);

  return uint8Array;
}
