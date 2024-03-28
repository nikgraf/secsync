import type { KeyPair } from "libsodium-wrappers";
import { z } from "zod";
import { sign } from "../crypto/sign";

export function createEphemeralMessageProof(
  remoteClientSessionId: string,
  currentClientSessionId: string,
  currentClientSignatureKeyPair: KeyPair,
  sodium: typeof import("libsodium-wrappers")
) {
  const SessionId = z.string();

  const signature = sign(
    {
      remoteClientSessionId: SessionId.parse(remoteClientSessionId),
      currentClientSessionId: SessionId.parse(currentClientSessionId),
    },
    "secsync_ephemeral_session_proof",
    currentClientSignatureKeyPair.privateKey,
    sodium
  );

  return sodium.from_base64(signature);
}
