import canonicalize from "canonicalize";
import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { EphemeralUpdate, EphemeralUpdatePublicData } from "../types";
import { dateToUint8Array } from "../utils/dateToUint8Array";
import { prefixWithUint8Array } from "../utils/prefixWithUint8Array";

export function createEphemeralUpdate(
  content: string | Uint8Array,
  publicData: EphemeralUpdatePublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(publicData) as string
  );
  // Each EphemeralUpdate is prefixed with the date it was created
  // to allow the recipient to know prevent reply attacks.
  const prefixedContent = prefixWithUint8Array(
    content,
    dateToUint8Array(new Date())
  );
  const { ciphertext, publicNonce } = encryptAead(
    prefixedContent,
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
    signatureKeyPair.privateKey,
    sodium
  );
  const ephemeralUpdate: EphemeralUpdate = {
    nonce: publicNonce,
    ciphertext,
    publicData,
    signature,
  };

  return ephemeralUpdate;
}
