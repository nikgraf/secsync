import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { ParentSnapshotProofInfo, Snapshot } from "../types";
import { isValidParentSnapshot } from "./isValidParentSnapshot";

export function verifyAndDecryptSnapshot(
  snapshot: Snapshot,
  key: Uint8Array,
  currentDocId: string,
  currentClientPublicKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers"),
  parentSnapshotProofInfo?: ParentSnapshotProofInfo,
  parentSnapshotUpdateClock?: number,
  logging?: "error" | "debug" | "off"
) {
  try {
    let publicKey: Uint8Array;
    let publicDataAsBase64: string;

    try {
      publicKey = sodium.from_base64(snapshot.publicData.pubKey);

      publicDataAsBase64 = sodium.to_base64(canonicalize(snapshot.publicData));

      const isValid = verifySignature(
        {
          nonce: snapshot.nonce,
          ciphertext: snapshot.ciphertext,
          publicData: publicDataAsBase64,
        },
        snapshot.signature,
        publicKey,
        sodium
      );
      if (!isValid) {
        return {
          error: new Error("SECSYNC_ERROR_111"),
        };
      }
    } catch (err) {
      if (logging === "error" || logging === "debug") {
        console.error(err);
      }
      return {
        error: new Error("SECSYNC_ERROR_111"),
      };
    }

    if (currentDocId !== snapshot.publicData.docId) {
      return {
        error: new Error("SECSYNC_ERROR_113"),
      };
    }

    if (parentSnapshotProofInfo) {
      try {
        const isValid = isValidParentSnapshot({
          snapshot,
          parentSnapshotCiphertext: parentSnapshotProofInfo.ciphertext,
          parentSnapshotId: parentSnapshotProofInfo.id,
          grandParentSnapshotProof: parentSnapshotProofInfo.parentSnapshotProof,
          sodium,
        });
        if (!isValid) {
          return {
            error: new Error("SECSYNC_ERROR_112"),
          };
        }
      } catch (err) {
        if (logging === "error" || logging === "debug") {
          console.error(err);
        }
        return {
          error: new Error("SECSYNC_ERROR_112"),
        };
      }
    }

    if (parentSnapshotUpdateClock !== undefined) {
      const currentClientPublicKeyString = sodium.to_base64(
        currentClientPublicKey
      );

      if (
        snapshot.publicData.parentSnapshotUpdateClocks[
          currentClientPublicKeyString
        ] !== parentSnapshotUpdateClock
      ) {
        return {
          error: new Error("SECSYNC_ERROR_102"),
        };
      }
    }

    try {
      const content = decryptAead(
        sodium.from_base64(snapshot.ciphertext),
        publicDataAsBase64,
        key,
        snapshot.nonce,
        sodium
      );
      return { content };
    } catch (err) {
      if (logging === "error" || logging === "debug") {
        console.error(err);
      }
      return {
        error: new Error("SECSYNC_ERROR_101"),
      };
    }
  } catch (err) {
    if (logging === "error" || logging === "debug") {
      console.error(err);
    }
    return {
      error: new Error("SECSYNC_ERROR_100"),
    };
  }
}
