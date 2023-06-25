export function hash(
  message: string | Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  return sodium.to_base64(sodium.crypto_generichash(32, message));
}
