import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { Update, UpdatePublicData } from "../types";
import { canonicalizeAndToBase64 } from "../utils/canonicalizeAndToBase64";

export function createUpdate(
  content: string | Uint8Array,
  publicData: UpdatePublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair,
  clock: number,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataWithClock = {
    ...publicData,
    clock,
  };

  const publicDataAsBase64 = canonicalizeAndToBase64(
    publicDataWithClock,
    sodium
  );
  const { ciphertext, publicNonce } = encryptAead(
    content,
    publicDataAsBase64,
    key,
    sodium
  );
  const signature = sign(
    {
      nonce: publicNonce,
      ciphertext,
      publicData: publicDataAsBase64,
    },
    "secsync_update",
    signatureKeyPair.privateKey,
    sodium
  );

  const update: Update = {
    nonce: publicNonce,
    ciphertext: ciphertext,
    publicData: publicDataWithClock,
    signature,
  };

  return update;
}
