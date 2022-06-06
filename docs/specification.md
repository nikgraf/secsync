## Encryption & Signing

All encrypted data uses the AEAD xchacha20poly1305_ietf construction. The nonce is always public and must be included along with the ciphertext.

While the AEAD construction already includes a MAC we additionally sign the data to verify its author. This is redundant and would not be necessary, but has been chosen to be able to rely on established constructions instead of implementing our own Signcryption like https://github.com/jedisct1/libsodium-signcryption.

## Snapshots

A Snapshot consists of the

- ciphertext
- nonce
- publicData
  - documentId
  - pubKey
  - snapshotId
  - hash
- signature

The `hash` is a hash of the ciphertexts of the current snapshot and all its updates and the parents hash.

The `signature` is a sigature of the concatinated `nonce` string, `ciphertext` string and `publicData` encoded as URL safe base64 string.

### Hash

```
ciphertextHash = hash(snapshot ciphertext) + hash([...update ciphertext hashes])
hash = hash(prevHash, ciphertextHash)
```

### Verify Snapshots

The ciphertext

#### Verifying if the snapshot is based on a previous snapshot

In order to verify that a snapshot is based on a previous snapshot we need to know the hash of the current snapshot and all the hashes of the previous snapshots up until the one we want to verify.

The server stores the list of snapshot hashes per document and once a client request the latest snapshot and at the same time provides the latest known snapshot the server must provide all the hashes including the hashes of the ciphertext of each snapshot up until the current snapshot.

##### Example

1. client sends a server hash `a` of snapshot A
2. server returns snapshot D and returns the hash verification structure

- [ciphertextHash of B, ciphertextHash of C]

To verify the hashes the client runs

```
b = hash(a, hash(ciphertextHash of B))
c = hash(b, hash(ciphertextHash of C))
d = hash(c, hash(ciphertextHash of D))
assert(d, hash of D)
```

In case d matches the hash of the current snapshot D the client verified that the server indeed returned a snapshot based on the already known snapshot.

#### Verifying that an update has been included in a snapshot

##### Example

1. client sends a server hash `a` of snapshot A
   and the known update `x`
2. server returns snapshot D and returns the hash verification structure

- [hashes of the update ciphertexts]
- [ciphertextHash of B, ciphertextHash of C, ciphertextHash of D]

To verify the hashes the client runs

```
assert(x included in updates hashes of B)
ciphertextHashB = hash(snapshot ciphertext hash, updates ciphertext hashes of B)
assert(ciphertextHashB, ciphertextHash of B)
```

#### Combined verification example

1. client sends a server hash `a` of snapshot A
   and the known update `x`
2. server returns snapshot D and returns the hash verification structure

- [hashes of the update ciphertexts]
- [ciphertextHash of B, ciphertextHash of C, ciphertextHash of D]

To verify the hashes the client runs

```
assert(x included in updates hashes of B)
ciphertextHashB = hash(snapshot ciphertext hash, updates ciphertext hashes of B)
assert(ciphertextHashB, ciphertextHash of B)
b = hash(a, hash(ciphertextHash of B))
c = hash(b, hash(ciphertextHash of C))
d = hash(c, hash(ciphertextHash of D))
assert(d, hash of D)
```
