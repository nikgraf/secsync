import { extractPrefixFromUint8Array } from "../utils/extractPrefixFromUint8Array";

export function decryptAead(
  ciphertext: Uint8Array,
  additionalData: string,
  key: Uint8Array,
  publicNonce: string,
  sodium: typeof import("libsodium-wrappers")
) {
  const content = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    additionalData,
    sodium.from_base64(publicNonce),
    key
  );
  // verify the block of null bytes to commit to a single (plaintext, AAD)
  // pair that result in the same (ciphertext, authentication tag) pair
  // see https://soatok.blog/2023/04/03/asymmetric-cryptographic-commitments/#what-is-commitment
  // and https://eprint.iacr.org/2019/016
  if (
    content[0] !== 0 ||
    content[1] !== 0 ||
    content[2] !== 0 ||
    content[3] !== 0
  ) {
    throw new Error("Invalid ciphertext due null byte block prefix missing");
  }

  const { value } = extractPrefixFromUint8Array(content, 4);
  return value;
}
