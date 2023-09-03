import canonicalize from "canonicalize";

export function sign(
  content: { [key in string]: string | number },
  privateKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  const message = canonicalize(content);
  if (typeof message !== "string") {
    throw new Error("Invalid content");
  }
  return sodium.to_base64(sodium.crypto_sign_detached(message, privateKey));
}
