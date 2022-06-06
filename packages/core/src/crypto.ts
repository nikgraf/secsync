import sodium from "@naisho/libsodium";

export async function encryptAead(
  message,
  additionalData: string,
  key: string
) {
  // TODO
  // const publicNonce = await sodium.randombytes_buf(
  //   sodiumWrappers.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  // );
  const publicNonce = await sodium.randombytes_buf(24);
  const result = {
    publicNonce,
    ciphertext: await sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      message,
      additionalData,
      null,
      publicNonce,
      key
    ),
  };
  return result;
}

export async function decryptAead(
  ciphertext: Uint8Array,
  additionalData: string,
  key: string,
  publicNonce: string
) {
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    sodium.to_base64(ciphertext),
    additionalData,
    publicNonce,
    key
  );
}

export async function createSignatureKeyPair() {
  const keypair = await sodium.crypto_sign_keypair();
  return {
    publicKey: sodium.from_base64(keypair.publicKey),
    privateKey: sodium.from_base64(keypair.privateKey),
    keyType: keypair.keyType,
  };
}

export async function sign(message, privateKey) {
  return await sodium.crypto_sign_detached(message, privateKey);
}

export async function verifySignature(message, signature, publicKey) {
  return await sodium.crypto_sign_verify_detached(
    signature,
    message,
    publicKey
  );
}
