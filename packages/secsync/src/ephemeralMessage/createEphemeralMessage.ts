import canonicalize from "canonicalize";
import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { EphemeralMessage, EphemeralMessagePublicData } from "../types";
import { intToUint8Array } from "../utils/intToUint8Array";
import { prefixWithUint8Array } from "../utils/prefixWithUint8Array";

export const messageTypes = {
  initialize: 0,
  proofAndRequestProof: 1,
  proof: 2,
  message: 3,
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
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(publicData) as string
  );

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
