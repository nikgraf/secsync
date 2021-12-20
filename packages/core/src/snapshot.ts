import sodium from "libsodium-wrappers";
import { decryptAead, Snapshot, SnapshotPublicData, verifySignature } from ".";
import { encryptAead, sign } from "./crypto";

export function createSnapshot(
  content,
  publicData: SnapshotPublicData,
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
  const snapshot: Snapshot = {
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

  return snapshot;
}

export function verifyAndDecryptSnapshot(snapshot: Snapshot, key, publicKey) {
  const publicDataAsBase64 = sodium.to_base64(
    JSON.stringify(snapshot.publicData)
  );

  const isValid = verifySignature(
    `${snapshot.nonce}${snapshot.ciphertext}${publicDataAsBase64}`,
    sodium.from_base64(snapshot.signature),
    publicKey
  );
  if (!isValid) {
    return null;
  }
  return decryptAead(
    sodium.from_base64(snapshot.ciphertext),
    sodium.to_base64(JSON.stringify(snapshot.publicData)),
    key,
    sodium.from_base64(snapshot.nonce)
  );
}
