import { z } from "zod";
import { verifySignature } from "../crypto/verifySignature";

export function verifyEphemeralSessionProof(
  signature: Uint8Array,
  remoteClientSessionId: string,
  currentClientSessionId: string,
  authorPublicKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers")
) {
  try {
    const SessionId = z.string();

    return verifySignature(
      {
        remoteClientSessionId: SessionId.parse(remoteClientSessionId),
        currentClientSessionId: SessionId.parse(currentClientSessionId),
      },
      sodium.to_base64(signature),
      authorPublicKey,
      sodium
    );
  } catch (err) {
    return false;
  }
}
