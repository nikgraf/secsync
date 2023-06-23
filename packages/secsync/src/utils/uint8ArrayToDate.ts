export function uint8ArrayToDate(uint8Array: Uint8Array): Date {
  if (uint8Array.length !== 8) {
    throw new Error("Invalid Uint8Array length. Expected 8 bytes.");
  }

  const buffer = uint8Array.buffer;
  const view = new DataView(buffer);

  const upper = view.getUint32(0);
  const lower = view.getUint32(4);
  const timestamp = upper * 0x100000000 + lower;

  return new Date(timestamp);
}
