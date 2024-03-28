import canonicalize from "canonicalize";

export function verifySignature(
  content: { [key in string]: string },
  signatureDomainContext: string,
  signature: string,
  publicKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  const message = canonicalize(content);
  if (typeof message !== "string") {
    return false;
  }
  return sodium.crypto_sign_verify_detached(
    sodium.from_base64(signature),
    signatureDomainContext + message,
    publicKey
  );
}
