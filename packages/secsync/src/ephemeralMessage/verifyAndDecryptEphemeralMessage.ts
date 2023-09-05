import canonicalize from "canonicalize";
import { KeyPair } from "libsodium-wrappers";
import { decryptAead } from "../crypto/decryptAead";
import { idLength } from "../crypto/generateId";
import { verifySignature } from "../crypto/verifySignature";
import { EphemeralMessage, EphemeralMessagesSession } from "../types";
import { extractPrefixFromUint8Array } from "../utils/extractPrefixFromUint8Array";
import { uint8ArrayToNumber } from "../utils/uint8ArrayToInt";
import { messageTypes } from "./createEphemeralMessage";
import { createEphemeralMessageProof } from "./createEphemeralSessionProof";
import { verifyEphemeralSessionProof } from "./verifyEphemeralSessionProof";

export function verifyAndDecryptEphemeralMessage(
  ephemeralMessage: EphemeralMessage,
  key: Uint8Array,
  ephemeralMessagesSession: EphemeralMessagesSession,
  authorSignatureKeyPair: KeyPair,
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(ephemeralMessage.publicData) as string
  );

  const publicKey = sodium.from_base64(ephemeralMessage.publicData.pubKey);

  const isValid = verifySignature(
    {
      nonce: ephemeralMessage.nonce,
      ciphertext: ephemeralMessage.ciphertext,
      publicData: publicDataAsBase64,
    },
    ephemeralMessage.signature,
    publicKey,
    sodium
  );
  if (!isValid) {
    throw new Error("Invalid ephemeral message");
  }
  const content = decryptAead(
    sodium.from_base64(ephemeralMessage.ciphertext),
    sodium.to_base64(canonicalize(ephemeralMessage.publicData) as string),
    key,
    ephemeralMessage.nonce,
    sodium
  );

  const { prefix: messageTypeAsUint8Array, value: tmpValue } =
    extractPrefixFromUint8Array(content, 1);
  const type = messageTypeAsUint8Array[0];
  const { prefix: sessionIdAsUint8Array, value: tmp2Value } =
    extractPrefixFromUint8Array(tmpValue, idLength);
  const sessionId = sodium.to_base64(sessionIdAsUint8Array);
  const { prefix: sessionCounterAsUint8Array, value } =
    extractPrefixFromUint8Array(tmp2Value, 4);
  const sessionCounter = uint8ArrayToNumber(sessionCounterAsUint8Array);
  const publicKeyAsBase64 = sodium.to_base64(publicKey);
  const { validSessions } = ephemeralMessagesSession;

  if (type === messageTypes.initialize) {
    const proof = createEphemeralMessageProof(
      sessionId,
      ephemeralMessagesSession.id,
      authorSignatureKeyPair,
      sodium
    );
    return {
      proof,
      requestProof: true,
      validSessions,
    };
  } else if (
    type === messageTypes.proof ||
    type === messageTypes.proofAndRequestProof
  ) {
    const isValid = verifyEphemeralSessionProof(
      value,
      ephemeralMessagesSession.id,
      sessionId,
      publicKey,
      sodium
    );

    if (isValid) {
      const newValidSessions = {
        ...validSessions,
        [publicKeyAsBase64]: {
          sessionId,
          sessionCounter,
        },
      };

      const proof =
        type === messageTypes.proofAndRequestProof
          ? createEphemeralMessageProof(
              sessionId,
              ephemeralMessagesSession.id,
              authorSignatureKeyPair,
              sodium
            )
          : undefined;

      return { validSessions: newValidSessions, proof, requestProof: false };
    } else {
      return { validSessions };
    }
  } else if (type === messageTypes.message) {
    if (
      !validSessions.hasOwnProperty(publicKeyAsBase64) ||
      validSessions[publicKeyAsBase64].sessionId !== sessionId ||
      validSessions[publicKeyAsBase64].sessionCounter >= sessionCounter
    ) {
      // if no session exist see it as an initialize, create a proof and request a proof
      const proof = createEphemeralMessageProof(
        sessionId,
        ephemeralMessagesSession.id,
        authorSignatureKeyPair,
        sodium
      );
      return {
        proof,
        requestProof: true,
        validSessions,
      };
    }

    const newValidSessions = {
      ...validSessions,
      [publicKeyAsBase64]: {
        sessionId,
        sessionCounter,
      },
    };

    return { content: value, validSessions: newValidSessions };
  } else {
    throw new Error("Invalid ephemeral message type");
  }
}
