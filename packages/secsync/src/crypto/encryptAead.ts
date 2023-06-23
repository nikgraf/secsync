import { prefixWithUint8Array } from "../utils/prefixWithUint8Array";

export function encryptAead(
  message: Uint8Array | string,
  additionalData: string,
  key: Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicNonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
  );
  const result = {
    publicNonce: sodium.to_base64(publicNonce),
    ciphertext: sodium.to_base64(
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        // prefixing with a block of null bytes to commit to a single (plaintext, AAD)
        // pair that result in the same (ciphertext, authentication tag) pair
        // see https://soatok.blog/2023/04/03/asymmetric-cryptographic-commitments/#what-is-commitment
        // and https://eprint.iacr.org/2019/016
        prefixWithUint8Array(message, new Uint8Array([0, 0, 0, 0])),
        additionalData,
        null,
        publicNonce,
        key
      )
    ),
  };
  return result;
}
