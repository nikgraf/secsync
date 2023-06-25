export const serializeUint8ArrayUpdates = (
  updates: Uint8Array[],
  sodium: typeof import("libsodium-wrappers")
) => {
  return JSON.stringify(updates.map((update) => sodium.to_base64(update)));
};
