export const uint8ArrayToNumber = (uint8Array: Uint8Array): number => {
  const dataView = new DataView(uint8Array.buffer);
  return dataView.getUint32(0, true);
};
