declare module "react-native-sodium-expo-plugin" {
  export function sodium_version_string(): Promise<string>;

  //
  // Generating random data
  //
  /**
   * Returns an unpredictable value between 0 and 0xffffffff (included).
   */
  export function randombytes_random(): Promise<number>;

  /**
   * Returns an unpredictable value between 0 and upper_bound (excluded).
   * Unlike randombytes_random() % upper_bound, it guarantees a uniform distribution of
   * the possible output values even when upper_bound is not a power of 2. Note that an
   * upper_bound < 2 leaves only a single element to be chosen, namely 0.
   */
  export function randombytes_uniform(upper_bound: number): Promise<number>;

  /**
   * Create a nonce
   */
  export function randombytes_buf(size: number): Promise<string>;

  /**
   * This deallocates the global resources used by the pseudo-random number generator.
   * More specifically, when the /dev/urandom device is used, it closes the descriptor.
   * Explicitly calling this function is almost never required.
   */
  export function randombytes_close(): Promise<number>;

  /**
   * Reseeds the pseudo-random number generator, if it supports this operation.
   * Calling this function is not required with the default generator, even after a fork() call,
   * unless the descriptor for /dev/urandom was closed using randombytes_close().
   */
  export function randombytes_stir(): Promise<number>;

  //
  // Secret-key cryptography - Authenticated encryption
  //
  /**
   * Bytes of key on secret-key cryptography, authenticated encryption
   */
  export const crypto_secretbox_KEYBYTES: number;

  /**
   * Bytes of nonce on secret-key cryptography, authenticated encryption
   */
  export const crypto_secretbox_NONCEBYTES: number;

  /**
   * Bytes of the authentication on secret-key cryptography, authenticated encryption
   */
  export const crypto_secretbox_MACBYTES: number;

  /**
   * Creates a random key. It is equivalent to calling randombytes_buf() but improves code
   * clarity and can prevent misuse by ensuring that the provided key length is always be correct.
   */
  export function crypto_secretbox_keygen(): Promise<string>;

  /**
   * Encrypts a message, with a nonce and a key.
   */
  export function crypto_secretbox_easy(
    message: string,
    nonce: string,
    key: string
  ): Promise<string>;

  /**
   * Verifies and decrypts a ciphertext produced by crypto_secretbox_easy().
   * The nonce and the key have to match the used to encrypt and authenticate the message.
   */
  export function crypto_secretbox_open_easy(
    cipher: string,
    nonce: string,
    key: string
  ): Promise<string>;

  //
  // Secret-key cryptography - Authentication
  //
  /**
   * Bytes of key on secret-key cryptography, authentication
   */
  export const crypto_auth_KEYBYTES: number;

  /**
   * Bytes of the authentication on secret-key cryptography, authentication
   */
  export const crypto_auth_BYTES: number;

  /**
   * Creates a random key. It is equivalent to calling randombytes_buf() but improves code
   * clarity and can prevent misuse by ensuring that the provided key length is always be correct.
   */
  export function crypto_auth_keygen(): Promise<string>;

  /**
   * Computes a tag for the message and the key.
   */
  export function crypto_auth(message: string, key: string): Promise<string>;

  /**
   * Verifies that the tag is valid for the message and the key.
   */
  export function crypto_auth_verify(
    tag: string,
    message: string,
    key: string
  ): Promise<number>;

  //
  // Public-key cryptography - Authenticated encryption
  //
  /**
   * Bytes of public key on public-key cryptography, authenticated encryption
   */
  export const crypto_box_PUBLICKEYBYTES: number;

  /**
   * Bytes of secret key on public-key cryptography, authenticated encryption
   */
  export const crypto_box_SECRETKEYBYTES: number;

  /**
   * Bytes of nonce on public-key cryptography, authenticated encryption
   */
  export const crypto_box_NONCEBYTES: number;

  /**
   * Bytes of the authentication on public-key cryptography, authenticated encryption
   */
  export const crypto_box_MACBYTES: number;

  /**
   *
   */
  export const crypto_box_ZEROBYTES: number;

  /**
   *
   */
  export const crypto_box_SEALBYTES: number;

  /**
   * Randomly generates a secret key (sk) and a corresponding public key (pk).
   */
  export function crypto_box_keypair(): Promise<{ sk: string; pk: string }>;

  /**
   * Encrypts a message, with a recipient's public key, a sender's secret key and a nonce.
   */
  export function crypto_box_easy(
    message: string,
    nonce: string,
    publicKey: string,
    secretKey: string
  ): Promise<string>;

  /**
   * Computes a shared secret key given a precalculated shared secret key.
   */
  export function crypto_box_easy_afternm(
    message: string,
    nonce: string,
    k: string
  ): Promise<string>;

  /**
   * Verifies and decrypts a ciphertext produced by crypto_box_easy().
   * The nonce has to match the nonce used to encrypt and authenticate the message.
   * Uses the public key of the sender that encrypted the message and the secret key
   * of the recipient that is willing to verify and decrypt it.
   */
  export function crypto_box_open_easy(
    cipher: string,
    nonce: string,
    publicKey: string,
    secretKey: string
  ): Promise<string>;

  /**
   * Computes a shared secret key given a precalculated shared secret key.
   */
  export function crypto_box_open_easy_afternm(
    cipher: string,
    nonce: string,
    k: string
  ): Promise<string>;

  /**
   * Computes a shared secret key given a public key pk and a secret key.
   */
  export function crypto_box_beforenm(
    publicKey: string,
    secretKey: string
  ): Promise<string>;

  /**
   * The key pair can be deterministically derived from a single key seed.
   */
  export function crypto_scalarmult_base(secretKey: string): Promise<string>;
  export function crypto_scalarmult(
    secretKey: string,
    publicKey: string
  ): Promise<string>;

  //
  // Public-key cryptography - Sealed boxes
  //
  /**
   * Encrypts a message for a recipient's public key. Only the recipient can decrypt
   * these messages, using its private key and it cannot verify the identity of the sender.
   */
  export function crypto_box_seal(
    message: string,
    publicKey: string
  ): Promise<string>;

  /**
   * Decrypts the ciphertext from crypto_box_seal, using the key pair.
   */
  export function crypto_box_seal_open(
    cipher: string,
    publicKey: string,
    secretKey: string
  ): Promise<string>;

  //
  // Public-key cryptography - Public-key signatures
  //
  /**
   * Bytes of public key on public-key cryptography, public-key signatures
   */
  export const crypto_sign_PUBLICKEYBYTES: number;

  /**
   * Bytes of secret key on public-key cryptography, public-key signatures
   */
  export const crypto_sign_SECRETKEYBYTES: number;

  /**
   * Bytes of single key seed on public-key cryptography, public-key signatures
   */
  export const crypto_sign_SEEDBYTES: number;

  /**
   * Bytes of the authentication on public-key cryptography, public-key signatures
   */
  export const crypto_sign_BYTES: number;

  /**
   * Signs the message using the secret key.
   */
  export function crypto_sign_detached(
    msg: string,
    secretKey: string
  ): Promise<string>;

  /**
   * Verifies that sig is a valid signature for the message using the signer's public key.
   */
  export function crypto_sign_verify_detached(
    sig: string,
    msg: string,
    publicKey: string
  ): Promise<boolean>;

  /**
   * Randomly generates a secret key and a corresponding public key.
   */
  export function crypto_sign_keypair(): Promise<{ sk: string; pk: string }>;

  /**
   * Get key pair derived from a single key seed.
   */
  export function crypto_sign_seed_keypair(
    seed: string
  ): Promise<{ sk: string; pk: string }>;

  /**
   * Extracts the seed from the secret key.
   */
  export function crypto_sign_ed25519_sk_to_seed(
    secretKey: string
  ): Promise<string>;

  /**
   * Converts an Ed25519 public key to an X25519 public key.
   */
  export function crypto_sign_ed25519_pk_to_curve25519(
    publicKey: string
  ): Promise<string>;

  /**
   * Converts an Ed25519 secret key to an X25519 secret key
   */
  export function crypto_sign_ed25519_sk_to_curve25519(
    secretKey: string
  ): Promise<string>;

  /**
   * Extracts the seed from the secret key sk.
   */
  export function crypto_sign_ed25519_sk_to_pk(
    secretKey: string
  ): Promise<string>;

  //
  // Password hashing
  //
  /**
   * Derives an key from a password and a salt whose fixed length is crypto_pwhash_SALTBYTES bytes.
   */
  export function crypto_pwhash(
    keylen: number,
    password: string,
    salt: string,
    opslimit: number,
    memlimit: number,
    algo: number
  ): Promise<string>;

  /**
   * Bytes of salt on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_SALTBYTES: number;

  /**
   * Baseline for computations to perform on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_OPSLIMIT_MODERATE: number;

  /**
   * Minimum numbers of CPU cycles to compute a key on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_OPSLIMIT_MIN: number;

  /**
   * Maximum numbers of CPU cycles to compute a key on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_OPSLIMIT_MAX: number;

  /**
   * Baseline for memory on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_MEMLIMIT_MODERATE: number;

  /**
   * Minimum memory allowed to compute a key on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_MEMLIMIT_MIN: number;

  /**
   * Maximum memory allowed to compute a key on password hashing, the pwhash* API.
   */
  export const crypto_pwhash_MEMLIMIT_MAX: number;

  /**
   * Tthe currently recommended algorithm, which can change from one version of libsodium to another.
   * On password hashing, the pwhash* API.
   */
  export const crypto_pwhash_ALG_DEFAULT: number;

  /**
   * Version 1.3 of the Argon2i algorithm.
   */
  export const crypto_pwhash_ALG_ARGON2I13: number;

  /**
   * Version 1.3 of the Argon2id algorithm, available since libsodium 1.0.13.
   */
  export const crypto_pwhash_ALG_ARGON2ID13: number;

  export const crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;

  export const crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;

  export const crypto_aead_xchacha20poly1305_ietf_ABYTES: number;

  export function crypto_aead_xchacha20poly1305_ietf_keygen(): Promise<string>;

  export function crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: string,
    additional_data: string,
    public_nonce: string,
    key: string
  ): Promise<string>;

  export function crypto_aead_xchacha20poly1305_ietf_decrypt(
    cipher: string,
    additional_data: string,
    public_nonce: string,
    key: string
  ): Promise<string>;
}
