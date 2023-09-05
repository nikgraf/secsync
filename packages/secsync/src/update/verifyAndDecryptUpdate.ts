import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { Update } from "../types";

export function verifyAndDecryptUpdate(
  update: Update,
  key: Uint8Array,
  currentClientPublicKey: string,
  currentClock: number,
  skipIfCurrentClockIsHigher: boolean,
  skipIfUpdateAuthoredByCurrentClient: boolean,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(update.publicData) as string
  );

  const publicKey = sodium.from_base64(update.publicData.pubKey);

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

  if (
    skipIfUpdateAuthoredByCurrentClient &&
    currentClientPublicKey === update.publicData.pubKey
  ) {
    return null;
  }

  if (
    skipIfCurrentClockIsHigher &&
    currentClock + 1 > update.publicData.clock
  ) {
    return null;
  }

  if (currentClock + 1 !== update.publicData.clock) {
    throw new Error(
      `Invalid clock for the update: ${currentClock + 1} ${
        update.publicData.clock
      }`
    );
  }

  const content = decryptAead(
    sodium.from_base64(update.ciphertext),
    sodium.to_base64(canonicalize(update.publicData) as string),
    key,
    update.nonce,
    sodium
  );

  return { content, clock: update.publicData.clock };
}
