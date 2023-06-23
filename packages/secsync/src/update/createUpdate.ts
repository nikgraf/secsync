import canonicalize from "canonicalize";
import type { KeyPair } from "libsodium-wrappers";
import { encryptAead } from "../crypto/encryptAead";
import { sign } from "../crypto/sign";
import { Update, UpdatePublicData } from "../types";

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

  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(publicDataWithClock) as string
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
