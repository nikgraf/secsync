import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { Update } from "../types";
import { canonicalizeAndToBase64 } from "../utils/canonicalizeAndToBase64";

export function verifyAndDecryptUpdate(
  update: Update,
  key: Uint8Array,
  currentActiveSnapshotId: string,
  currentClock: number,
  sodium: typeof import("libsodium-wrappers"),
  logging?: "error" | "debug" | "off"
) {
  try {
    let publicDataAsBase64: string;
    try {
      publicDataAsBase64 = canonicalizeAndToBase64(update.publicData, sodium);

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
        return {
          error: new Error("SECSYNC_ERROR_212"),
        };
      }
    } catch (err) {
      if (logging === "error" || logging === "debug") {
        console.error(err);
      }
      return {
        error: new Error("SECSYNC_ERROR_212"),
      };
    }

    if (currentActiveSnapshotId !== update.publicData.refSnapshotId) {
      return { error: new Error("SECSYNC_ERROR_213") };
    }

    if (update.publicData.clock <= currentClock) {
      if (logging === "error" || logging === "debug") {
        console.warn(
          `Clock ${update.publicData.clock} is equal or lower than currentClock ${currentClock}`
        );
      }
      return { error: new Error("SECSYNC_ERROR_214") };
    }

    if (currentClock + 1 !== update.publicData.clock) {
      if (logging === "error" || logging === "debug") {
        console.error(
          `Clock ${currentClock} did increase by more than one. Incoming Clock: ${update.publicData.clock} `
        );
      }
      return { error: new Error("SECSYNC_ERROR_202") };
    }

    try {
      const content = decryptAead(
        sodium.from_base64(update.ciphertext),
        publicDataAsBase64,
        key,
        update.nonce,
        sodium
      );

      return { content, clock: update.publicData.clock };
    } catch (err) {
      if (logging === "error" || logging === "debug") {
        console.error(err);
      }
      return { error: new Error("SECSYNC_ERROR_201") };
    }
  } catch (err) {
    if (logging === "error" || logging === "debug") {
      console.error(err);
    }
    return { error: new Error("SECSYNC_ERROR_200") };
  }
}
