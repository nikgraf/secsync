export function decryptAead(
  ciphertext: Uint8Array,
  additionalData: string,
  key: Uint8Array,
  publicNonce: string,
  sodium: typeof import("libsodium-wrappers")
) {
  const robustnessTag = ciphertext.slice(0, 32);
  const ciphertextWithoutRobustnessTag = ciphertext.slice(32);

  const isValid = sodium.crypto_auth_verify(
    robustnessTag,
    publicNonce +
      sodium.to_base64(ciphertextWithoutRobustnessTag) +
      additionalData,
    key
  );
  if (!isValid) {
    throw new Error("Invalid robustness tag");
  }

  const content = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertextWithoutRobustnessTag,
    additionalData,
    sodium.from_base64(publicNonce),
    key
  );
  return content;
}
