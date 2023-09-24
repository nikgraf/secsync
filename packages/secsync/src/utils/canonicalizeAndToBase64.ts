import canonicalize from "canonicalize";

export const canonicalizeAndToBase64 = (
  input: unknown,
  sodium: typeof import("libsodium-wrappers")
): string => {
  const canonicalized = canonicalize(input);
  if (!canonicalized) {
    throw new Error("Failed to canonicalize input");
  }
  return sodium.to_base64(canonicalized);
};
