export const deserializeUint8ArrayUpdates = (
  serialized: string,
  sodium: typeof import("libsodium-wrappers")
): Uint8Array[] => {
  const parsed = JSON.parse(serialized);
  return parsed.map((update: string) => sodium.from_base64(update));
};
