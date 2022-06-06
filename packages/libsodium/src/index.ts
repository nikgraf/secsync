import sodium, { StringKeyPair } from "libsodium-wrappers";
import { to_base64, from_base64, from_base64_to_string } from "./base64wasm";
export { to_base64, from_base64, from_base64_to_string } from "./base64wasm";
export type { StringKeyPair, KeyPair, KeyType } from "libsodium-wrappers";
import {
  base64ToUrlSafeBase64,
  urlSafeBase64ToBase64,
} from "./base64Conversion";
export const ready = sodium.ready;

declare const Buffer: any;

export const randombytes_buf = async (length: number): Promise<string> => {
  const result = await sodium.randombytes_buf(length);
  return to_base64(result);
};

export const crypto_sign_keypair = async (): Promise<StringKeyPair> => {
  const result = await sodium.crypto_sign_keypair();
  return {
    keyType: "ed25519",
    privateKey: to_base64(result.privateKey),
    publicKey: to_base64(result.publicKey),
  };
};

export const crypto_sign_detached = async (
  message: string,
  privateKey: string
): Promise<string> => {
  const result = await sodium.crypto_sign_detached(
    message,
    from_base64(privateKey)
  );
  return to_base64(result);
};

export const crypto_sign_verify_detached = async (
  signature: string,
  message: string,
  publicKey: string
): Promise<boolean> => {
  return await sodium.crypto_sign_verify_detached(
    from_base64(signature),
    message,
    from_base64(publicKey)
  );
};

export const crypto_aead_xchacha20poly1305_ietf_keygen =
  async (): Promise<string> =>
    to_base64(sodium.crypto_aead_xchacha20poly1305_ietf_keygen());

export const crypto_aead_xchacha20poly1305_ietf_encrypt = async (
  message: string,
  additional_data: string,
  secret_nonce: null,
  public_nonce: string,
  key: string
): Promise<string> => {
  const result = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    additional_data,
    secret_nonce,
    from_base64(public_nonce),
    from_base64(key)
  );
  return to_base64(result);
};

export const crypto_aead_xchacha20poly1305_ietf_decrypt = async (
  secret_nonce: null,
  ciphertext: string,
  additional_data: string,
  public_nonce: string,
  key: string
): Promise<string> => {
  const result = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    secret_nonce,
    from_base64(ciphertext),
    additional_data,
    from_base64(public_nonce),
    from_base64(key)
  );
  return to_base64(result);
};

export const crypto_generichash = async (
  hash_length: number,
  b64_password: string
): Promise<string> => {
  const result = sodium.crypto_generichash(
    hash_length,
    from_base64(b64_password)
  );
  return to_base64(result);
};

export const crypto_generichash_batch = (arr: Array<string>): string => {
  // TODO remove/cleanup? Buffer should not be needed
  const key = new Uint8Array(Buffer.alloc(sodium.crypto_generichash_KEYBYTES));
  const state = sodium.crypto_generichash_init(
    key,
    sodium.crypto_generichash_BYTES
  );
  arr.forEach((item) => {
    sodium.crypto_generichash_update(state, sodium.from_base64(item));
  });
  const combinedHash = sodium.crypto_generichash_final(
    state,
    sodium.crypto_generichash_BYTES
  );
  return to_base64(combinedHash);
};

export const crypto_kx_keypair = (): StringKeyPair => {
  const result = sodium.crypto_kx_keypair();
  return {
    keyType: "curve25519",
    privateKey: to_base64(result.privateKey),
    publicKey: to_base64(result.publicKey),
  };
};

export const crypto_pwhash = (
  keyLength: number,
  password: string,
  salt: string,
  opsLimit: number,
  memLimit: number,
  algorithm: number
): string => {
  const result = sodium.crypto_pwhash(
    keyLength,
    from_base64(password),
    from_base64(salt),
    opsLimit,
    memLimit,
    algorithm
  );
  return to_base64(result);
};

export const crypto_secretbox_easy = (
  message: string,
  nonce: string,
  key: string
): string => {
  const cipherText = sodium.crypto_secretbox_easy(
    from_base64(message),
    from_base64(nonce),
    from_base64(key)
  );
  return to_base64(cipherText);
};

export const crypto_secretbox_open_easy = (
  cipherText: string,
  nonce: string,
  key: string
): string => {
  const message = sodium.crypto_secretbox_open_easy(
    from_base64(cipherText),
    from_base64(nonce),
    from_base64(key)
  );
  return to_base64(message);
};

export const crypto_kx_client_session_keys = (
  clientPublicKey: string,
  clientPrivateKey: string,
  serverPublicKey: string
) => {
  const clientSessionKeys = sodium.crypto_kx_client_session_keys(
    from_base64(clientPublicKey),
    from_base64(clientPrivateKey),
    from_base64(serverPublicKey)
  );
  return clientSessionKeys;
};

export const crypto_box_keypair = (): StringKeyPair => {
  const result = sodium.crypto_box_keypair();
  return {
    keyType: "curve25519",
    privateKey: to_base64(result.privateKey),
    publicKey: to_base64(result.publicKey),
  };
};

const libsodiumExports = {
  ready,
  to_base64,
  from_base64,
  from_base64_to_string,
  crypto_pwhash,
  randombytes_buf,
  crypto_kx_keypair,
  crypto_generichash,
  crypto_box_keypair,
  crypto_sign_keypair,
  crypto_sign_detached,
  crypto_secretbox_easy,
  crypto_secretbox_open_easy,
  crypto_generichash_batch,
  crypto_sign_verify_detached,
  crypto_kx_client_session_keys,
  crypto_aead_xchacha20poly1305_ietf_keygen,
  crypto_aead_xchacha20poly1305_ietf_encrypt,
  crypto_aead_xchacha20poly1305_ietf_decrypt,
  base64_to_url_safe_base64: base64ToUrlSafeBase64,
  url_safe_base64_to_base64: urlSafeBase64ToBase64,
};

type Libsodium = typeof libsodiumExports & {
  crypto_generichash_BYTES: number;
  crypto_secretbox_NONCEBYTES: number;
  crypto_pwhash_SALTBYTES: number;
  crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
  crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
  crypto_pwhash_ALG_DEFAULT: number;
  crypto_secretbox_KEYBYTES: number;
};

const handler = {
  get(_target: Libsodium, prop: keyof Libsodium): any {
    if (prop === "crypto_generichash_BYTES") {
      return sodium.crypto_generichash_BYTES;
    } else if (prop === "crypto_secretbox_NONCEBYTES") {
      return sodium.crypto_secretbox_NONCEBYTES;
    } else if (prop === "crypto_pwhash_SALTBYTES") {
      return sodium.crypto_pwhash_SALTBYTES;
    } else if (prop === "crypto_pwhash_OPSLIMIT_INTERACTIVE") {
      return sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
    } else if (prop === "crypto_pwhash_MEMLIMIT_INTERACTIVE") {
      return sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;
    } else if (prop === "crypto_pwhash_ALG_DEFAULT") {
      return sodium.crypto_pwhash_ALG_DEFAULT;
    } else if (prop === "crypto_secretbox_KEYBYTES") {
      return sodium.crypto_secretbox_KEYBYTES;
    }
    // @ts-ignore
    return Reflect.get(...arguments);
  },
};

export default new Proxy(libsodiumExports, handler) as Libsodium;
