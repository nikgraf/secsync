export const idLength = 24;

// As pointed out in the initial SBA Research instead of using uuidv4() it's
// recommended to use a cryptographically secure random number generator with
// a minimum of 16 bytes of entropy.
// Using a 24 bytes results in a base64 encoded string of 32 characters which
// has an identical length to uuids, but an higher entropy.
export const generateId = (sodium: typeof import("libsodium-wrappers")) => {
  return sodium.to_base64(sodium.randombytes_buf(idLength));
};
