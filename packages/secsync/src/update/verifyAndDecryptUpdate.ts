import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { Update } from "../types";

export function verifyAndDecryptUpdate(
  update: Update,
  key: Uint8Array,
  publicKey: Uint8Array,
  currentClock: number,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(update.publicData) as string
  );

  const isValid = verifySignature(
    {
      nonce: update.nonce,
      ciphertext: update.ciphertext,
      publicData: publicDataAsBase64,
    },
    update.signature,
    publicKey,
    sodium
  );
  if (!isValid) {
    throw new Error("Invalid signature for update");
  }

  const content = decryptAead(
    sodium.from_base64(update.ciphertext),
    sodium.to_base64(canonicalize(update.publicData) as string),
    key,
    update.nonce,
    sodium
  );

  if (currentClock + 1 !== update.publicData.clock) {
    throw new Error(
      `Invalid clock for the update: ${currentClock + 1} ${
        update.publicData.clock
      }`
    );
  }

  return { content, clock: update.publicData.clock };
}
