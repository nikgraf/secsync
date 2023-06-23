export const dateAsUint8ArrayLength = 8;

export function dateToUint8Array(date: Date): Uint8Array {
  const timestamp = date.getTime();
  const buffer = new ArrayBuffer(dateAsUint8ArrayLength);

  // A DataView is created to set the Uint32 values in the buffer. The timestamp is divided into two Uint32 values: the upper 32 bits (the most significant bits) and the lower 32 bits (the least significant bits). Finally, a Uint8Array is created from the buffer and returned.
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(timestamp / 0x100000000));
  view.setUint32(4, timestamp % 0x100000000);

  return new Uint8Array(buffer);
}
