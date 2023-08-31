import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { idLength } from "../crypto/generateId";
import { verifySignature } from "../crypto/verifySignature";
import { EphemeralUpdate } from "../types";
import { extractPrefixFromUint8Array } from "../utils/extractPrefixFromUint8Array";
import { uint8ArrayToNumber } from "../utils/uint8ArrayToInt";

export function verifyAndDecryptEphemeralUpdate(
  ephemeralUpdate: EphemeralUpdate,
  key: Uint8Array,
  publicKey: Uint8Array,
  validSessions: { [authorSessionId: string]: number },
  sodium: typeof import("libsodium-wrappers")
) {
  const publicDataAsBase64 = sodium.to_base64(
    canonicalize(ephemeralUpdate.publicData) as string
  );

  const isValid = verifySignature(
    {
      nonce: ephemeralUpdate.nonce,
      ciphertext: ephemeralUpdate.ciphertext,
      publicData: publicDataAsBase64,
    },
    ephemeralUpdate.signature,
    publicKey,
    sodium
  );
  if (!isValid) {
    throw new Error("Invalid ephemeral update");
  }
  const content = decryptAead(
    sodium.from_base64(ephemeralUpdate.ciphertext),
    sodium.to_base64(canonicalize(ephemeralUpdate.publicData) as string),
    key,
    ephemeralUpdate.nonce,
    sodium
  );

  const { prefix: authorSessionIdAsUint8Array, value: tmpValue } =
    extractPrefixFromUint8Array(content, idLength);
  const authorSessionId = sodium.to_base64(authorSessionIdAsUint8Array);

  if (!validSessions.hasOwnProperty(authorSessionId)) {
    throw new Error("authorSessionId is not available in validSessions");
  }
  const { prefix: authorSessionCounterAsUint8Array, value } =
    extractPrefixFromUint8Array(tmpValue, 4);
  const authorSessionCounter = uint8ArrayToNumber(
    authorSessionCounterAsUint8Array
  );
  if (validSessions[authorSessionId] >= authorSessionCounter) {
    throw new Error("authorSessionCounter is not valid");
  }
  return { content: value, authorSessionId, authorSessionCounter };
}
