import sodium from "libsodium-wrappers";
import {
  decryptAead,
  AwarenessUpdate,
  AwarenessUpdatePublicData,
  verifySignature,
} from ".";
import { encryptAead, sign } from "./crypto";

export function createAwarenessUpdate(
  content,
  publicData: AwarenessUpdatePublicData,
  key: Uint8Array,
  signatureKeyPair: sodium.KeyPair
) {
  const publicDataAsBase64 = sodium.to_base64(JSON.stringify(publicData));
  const { ciphertext, publicNonce } = encryptAead(
    content,
    publicDataAsBase64,
    key
  );
  const nonceBase64 = sodium.to_base64(publicNonce);
  const ciphertextBase64 = sodium.to_base64(ciphertext);
  const awarenessUpdate: AwarenessUpdate = {
    nonce: nonceBase64,
    ciphertext: ciphertextBase64,
    publicData,
    signature: sodium.to_base64(
      sign(
        `${nonceBase64}${ciphertextBase64}${publicDataAsBase64}`,
        signatureKeyPair.privateKey
      )
    ),
  };

  return awarenessUpdate;
}

export function verifyAndDecryptAwarenessUpdate(
  update: AwarenessUpdate,
  key,
  publicKey
) {
  const publicDataAsBase64 = sodium.to_base64(
    JSON.stringify(update.publicData)
  );

  const isValid = verifySignature(
    `${update.nonce}${update.ciphertext}${publicDataAsBase64}`,
    sodium.from_base64(update.signature),
    publicKey
  );
  if (!isValid) {
    return null;
  }
  return decryptAead(
    sodium.from_base64(update.ciphertext),
    sodium.to_base64(JSON.stringify(update.publicData)),
    key,
    sodium.from_base64(update.nonce)
  );
}
