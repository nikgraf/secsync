import type { KeyPair } from "libsodium-wrappers";

export function createSignatureKeyPair(
  sodium: typeof import("libsodium-wrappers")
): KeyPair {
  return sodium.crypto_sign_keypair();
}
