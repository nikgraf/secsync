export function encryptAead(
  message: Uint8Array | string,
  additionalData: string,
  key: Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicNonceUint8Array = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const publicNonce = sodium.to_base64(publicNonceUint8Array);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    additionalData,
    null,
    publicNonceUint8Array,
    key
  );

  const robustnessTag = sodium.crypto_auth(
    publicNonce + sodium.to_base64(ciphertext) + additionalData,
    key
  );

  const finalCiphertext = new Uint8Array(
    robustnessTag.length + ciphertext.length
  );
  finalCiphertext.set(robustnessTag);
  finalCiphertext.set(ciphertext, robustnessTag.length);

  return {
    publicNonce,
    ciphertext: sodium.to_base64(finalCiphertext),
  };
}
