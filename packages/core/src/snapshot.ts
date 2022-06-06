import sodium, { KeyPair } from "@naisho/libsodium";
import { Snapshot, SnapshotPublicData } from "./types";
import { encryptAead, sign, verifySignature, decryptAead } from "./crypto";

type PendingResult =
  | { type: "snapshot" }
  | { type: "updates"; rawUpdates: any[] }
  | { type: "none" };

const snapshotsInProgress = {};
const pendingSnapshot = {};
const pendingUpdates = {};

export function addSnapshotToInProgress(snapshot: Snapshot) {
  snapshotsInProgress[snapshot.publicData.docId] = snapshot;
}

export function removeSnapshotInProgress(documentId: string) {
  delete snapshotsInProgress[documentId];
}

export function getSnapshotInProgress(documentId: string) {
  return snapshotsInProgress[documentId];
}

export function addPendingSnapshot(documentId: string) {
  pendingSnapshot[documentId] = true;
}

export function addPendingUpdate(documentId, rawUpdate: any) {
  if (pendingUpdates[documentId] === undefined) {
    pendingUpdates[documentId] = [];
  }
  pendingUpdates[documentId].push(rawUpdate);
}

export function removePending(documentId) {
  delete pendingSnapshot[documentId];
  delete pendingUpdates[documentId];
}

export function getPending(documentId): PendingResult {
  if (pendingSnapshot[documentId]) {
    return { type: "snapshot" };
  } else if (
    Array.isArray(pendingUpdates[documentId]) &&
    pendingUpdates[documentId].length > 0
  ) {
    return { type: "updates", rawUpdates: pendingUpdates[documentId] };
  }
  return { type: "none" };
}

export async function createSnapshot(
  content,
  publicData: SnapshotPublicData,
  key: Uint8Array,
  signatureKeyPair: KeyPair
) {
  const publicDataAsBase64 = sodium.to_base64(JSON.stringify(publicData));
  const { ciphertext, publicNonce } = await encryptAead(
    content,
    publicDataAsBase64,
    sodium.to_base64(key)
  );
  const signature = await sign(
    `${publicNonce}${ciphertext}${publicDataAsBase64}`,
    sodium.to_base64(signatureKeyPair.privateKey)
  );
  const snapshot: Snapshot = {
    nonce: publicNonce,
    ciphertext,
    publicData,
    signature,
  };

  return snapshot;
}

export async function verifyAndDecryptSnapshot(
  snapshot: Snapshot,
  key: Uint8Array,
  publicKey: Uint8Array
) {
  const publicDataAsBase64 = sodium.to_base64(
    JSON.stringify(snapshot.publicData)
  );

  const isValid = await verifySignature(
    `${snapshot.nonce}${snapshot.ciphertext}${publicDataAsBase64}`,
    snapshot.signature,
    sodium.to_base64(publicKey)
  );
  if (!isValid) {
    return null;
  }
  return await decryptAead(
    sodium.from_base64(snapshot.ciphertext),
    sodium.to_base64(JSON.stringify(snapshot.publicData)),
    sodium.to_base64(key),
    snapshot.nonce
  );
}
