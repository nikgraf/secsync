import canonicalize from "canonicalize";
import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { EphemeralUpdate, EphemeralUpdatePublicData } from "../types";
import { intToUint8Array } from "../utils/intToUint8Array";
import { prefixWithUint8Array } from "../utils/prefixWithUint8Array";

export function createEphemeralUpdate(
  content: string | Uint8Array,
  publicData: EphemeralUpdatePublicData,
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

  // Each EphemeralUpdate is prefixed with the authorSessionId
  prefixedContent = prefixWithUint8Array(
    prefixedContent,
    sodium.from_base64(authorSessionId)
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
  const ephemeralUpdate: EphemeralUpdate = {
    nonce: publicNonce,
    ciphertext,
    publicData,
    signature,
  };

  return ephemeralUpdate;
}
