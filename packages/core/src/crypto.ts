import sodium from "libsodium-wrappers";

export function encryptAead(message, additionalData: string, key: Uint8Array) {
  const secretNonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NSECBYTES
  );
  const publicNonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  return {
    publicNonce,
    ciphertext: sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      message,
      additionalData,
      secretNonce,
      publicNonce,
      key
    ),
  };
}

export function decryptAead(
  ciphertext,
  additionalData: string,
  key: Uint8Array,
  publicNonce: Uint8Array
) {
  if (ciphertext.length < sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES) {
    throw "The ciphertext was too short";
  }

  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    new Uint8Array(0),
    ciphertext,
    additionalData,
    publicNonce,
    key
  );
}

export function createSignatureKeyPair() {
  return sodium.crypto_sign_keypair();
}

export function sign(message, privateKey) {
  return sodium.crypto_sign_detached(message, privateKey);
}

export function verifySignature(message, signature, publicKey) {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}
