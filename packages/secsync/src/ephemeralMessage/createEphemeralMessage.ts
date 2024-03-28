import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { EphemeralMessage, EphemeralMessagePublicData } from "../types";
import { canonicalizeAndToBase64 } from "../utils/canonicalizeAndToBase64";
import { intToUint8Array } from "../utils/intToUint8Array";
import { prefixWithUint8Array } from "../utils/prefixWithUint8Array";

export const messageTypes = {
  initialize: 1,
  proofAndRequestProof: 2,
  proof: 3,
  message: 4,
};

export function createEphemeralMessage(
  content: string | Uint8Array,
  type: keyof typeof messageTypes,
  publicData: EphemeralMessagePublicData,
  key: Uint8Array,
  authorSignatureKeyPair: KeyPair,
  authorSessionId: string,
  authorSessionCounter: number,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = canonicalizeAndToBase64(publicData, sodium);

  let prefixedContent = prefixWithUint8Array(
    content,
    intToUint8Array(authorSessionCounter)
  );

  // each EphemeralMessage is prefixed with the authorSessionId
  prefixedContent = prefixWithUint8Array(
    prefixedContent,
    sodium.from_base64(authorSessionId)
  );

  // each EphemeralMessage is prefixed with the message type
  prefixedContent = prefixWithUint8Array(
    prefixedContent,
    new Uint8Array([messageTypes[type]])
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
    "secsync_ephemeral_message",
    authorSignatureKeyPair.privateKey,
    sodium
  );
  const ephemeralMessage: EphemeralMessage = {
    nonce: publicNonce,
    ciphertext,
    publicData,
    signature,
  };

  return ephemeralMessage;
}
