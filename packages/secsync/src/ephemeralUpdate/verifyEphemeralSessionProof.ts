import { z } from "zod";
import { verifySignature } from "../crypto/verifySignature";

export function verifyEphemeralSessionProof(
  signature: string,
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
      signature,
      authorPublicKey,
      sodium
    );
  } catch (err) {
    return false;
  }
}
