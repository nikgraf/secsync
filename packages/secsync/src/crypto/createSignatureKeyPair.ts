export function createSignatureKeyPair(
  sodium: typeof import("libsodium-wrappers")
) {
  return sodium.crypto_sign_keypair();
}
