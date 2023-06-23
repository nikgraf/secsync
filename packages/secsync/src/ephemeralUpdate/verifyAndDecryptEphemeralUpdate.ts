import canonicalize from "canonicalize";
import { decryptAead } from "../crypto/decryptAead";
import { verifySignature } from "../crypto/verifySignature";
import { EphemeralUpdate } from "../types";
import { dateAsUint8ArrayLength } from "../utils/dateToUint8Array";
import { extractPrefixFromUint8Array } from "../utils/extractPrefixFromUint8Array";
import { uint8ArrayToDate } from "../utils/uint8ArrayToDate";

function isOlderThanTenMin(date: Date): boolean {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  return date < tenMinutesAgo;
}

export function verifyAndDecryptEphemeralUpdate(
  ephemeralUpdate: EphemeralUpdate,
  key,
  publicKey: Uint8Array,
  sodium: typeof import("libsodium-wrappers"),
  mostRecentEphemeralUpdateDate?: Date
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
  const { prefix, value } = extractPrefixFromUint8Array(
    content,
    dateAsUint8ArrayLength
  );
  const date = uint8ArrayToDate(prefix);
  if (isOlderThanTenMin(date)) {
    throw new Error("Ephemeral update is older than 10 minutes");
  }

  if (mostRecentEphemeralUpdateDate && date <= mostRecentEphemeralUpdateDate) {
    throw new Error(
      "Incoming ephemeral update is older or equal than a received one"
    );
  }
  return { content: value, date };
}
