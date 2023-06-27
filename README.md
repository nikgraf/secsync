# Secsync

Is an architecture to relay end-to-end encrypted CRDTs over a central service.

It was created out of the need to have an end-to-end encrypted protocol to allow data synchronization/fetching incl. real-time updates to support [local-first](https://www.inkandswitch.com/local-first/) apps in combination with a web clients without locally stored data.

**WARNING**: This is a rough prototype! A production ready implementation is planned after an initial round of feedback.

## Examples

- End-to-end encrypted document using [Yjs](https://github.com/yjs/yjs) incl. Cursor Awareness
- End-to-end encrypted todo list using [Automerge](https://github.com/automerge/automerge)

Try them out at [https://www.secsync.com/](https://www.secsync.com/)

## Concept

The architecture is built upon 3 building blocks:

1. Document
2. Snapshot
3. Update

A _Document_ is defined by an **ID** and the **active Snapshot**.

A _Snapshot_ includes the **encrypted CRDT document** at a certain time.

An _Update_ includes one or multiple **encrypted CRDT updates** referencing a snapshot.

An _Ephemeral Update_ includes one or multiple **encrypted entries** referencing a snapshot and if available update.

If look at it from a perspective of the current state of one document it looks like this:

<img src="./docs/secsync-document-representation.png?raw=true" width="323" height="339" alt="State of one document as snapshots and updates." />

If you look at it over time it looks like a tree that that always comes together once a snapshot is created:

<img src="./docs/secsync-time-representation.png?raw=true" width="309" height="521" alt="State of one document as snapshots and updates." />

When the server service persists an update it stores it with an integer based version number which is returned to every client. This way clients efficiently can ask for only the updates they haven't received.

## Use Cases

### Local-first only app

In this case each client per document has to keep the

- Document ID
- CRDT document
- Active Snapshot ID
- Active Snapshot latest server version integer

By sending the document ID, active Snapshot ID and the active Snapshot version integer the client will receive only the latest changes. This can be:

- Updates
- New active Snapshot + Updates

If all clients stay relatively up to date all the time new snapshots would be inefficient and not necessary. They might still be relevant e.g. when a collaborator is removed from the document and the encryption key is rotated.

### Cloud based app

In this case the client only needs to know the document ID and can fetch the latest snapshot incl. the referencing snapshots to construct the document. Here it makes sense to regularly create new snapshots to avoid longer loading times.

### Mixed app (local first + cloud)

Since it's the same API both can be supported. Creating snapshots regularly is probably the favorable way to go in this case.

## Encryption

Each Snapshot and Update is encrypted using an AEAD constructions. Specifically [XChaCha20-Poly1305-IETF](https://doc.libsodium.org/secret-key_cryptography/aead#availability-and-interoperability). Exchange incl. rotation of the secret key is not part of this protocol and could be done by using the Signal Protocol or lockboxes based on an existing Public key infrastructure (PKI).

Each Snapshot also includes unencrypted but authenticated data so that the server and other clients can verify that authenticity of the Document & Snapshot ID relation. Unencrypted data:

- Document ID
- Snapshot ID
- Public Key of the Client

Each Update also includes unencrypted but authenticated data so that the server and other clients can verify that authenticity of the relationship to a Snapshot and Document.Unencrypted data:

- Document ID
- Snapshot ID
- Public Key of the Client
- Clock

The clock property is an incrementing integer that serves multiple purposes:

- That the central service does not persist an update if the previous one wasn't persisted.
- Each client to verify that it receives all updates per snapshot per client.

The data (encrypted and unencrypted) of each Snapshot and Update further is signed with the public key of the client using a ED2559 Signature. This ensures the authenticity of the data per client and is relevant to make sure to relate the incrementing clock to client.

The public keys further could be use to verify that only collaborators with the authorization have to make changes to a document actually do so. Serenity will use a [signed hash chain](https://github.com/serenity-kit/Serenity/tree/main/packages/workspace-chain) that's currently in development to ensure the authenticity of all collaborators.

There are use-cases where the public keys and signatures are only used to verify the updates per client e.g. a short term shared document in a video call.

## Data Integrity

It's the responsibility of the central service to ensure the data integrity based on the Snapshot ID and Update clocks. This means updates are only persisted when the previous update per snapshot per client is persisted and snapshot is only persisted if it references the previous snapshot incl. all it's related updates.

The server can't verify if the encrypted data is corrupt. Clients have to trust each other or verify the changes. There are certain limitations to verifying the data integrity and if the central service cooperates with one participant the can be broken in various ways.

## Near Real-time

Updates can be sent immediately when they happen (to reduce overhead for real-time communication), but will only be persisted in the right order and clients will only apply them in the right order.

## Meta Data

This protocol doesn't hide meta data from the server. This means the relay service is aware on which documents a client has access to and when and how roughly how much someone contributed to a document.

## High level threat model & trust model

- The central relay service can not inject any participants nor data into a document.
- The server can completely cut out one user at any point without being detected. We are thinking to mitigate this with read notifications in a future version of Secsync.
- Clients have to trust each other.

Note: Instantly removing access can also be seen as an advantage. In in a decentralized system you can have the issue that a collaborator is removed, but until this information is propagate all participants they will continue to share updates with the remove collaborator.

## Further Reading

More documentation can be found in the [docs](./docs) folder.

- [Requirements](./docs/requirements.md)
- [Specification](./docs/specification.md)
- [Security & Privacy Considerations](./docs/security_and_privacy_considerations.md)
- [Threat Library](./docs/threat-library.md)

## FAQ & Background

### Why Snapshots and not only rely on encrypted Updates?

Documents that are a couple of pages long can included several thousand changes. When loading a document this would mean downloading, decrypting and applying all of them to a CRDT document. This is an UX issue and here snapshots can help, because if downloading one Snapshot, decrypting it and loading the compressed CRDT document is way faster.

Note: We plan to add benchmarks for comparison in the future.

### Why use a central relay service?

The main reason is to exchange data asynchronously. Meaning one client can create an update and another one retrieve it later when the first one is not online anymore.

A second reason is that

- To create a single stream of snapshots and updates for easier synchronization. (avoids handling complex problems like topological sorting for DAGs … for now)

### Can I move my document to another central service?

Yes. You can fetch the essential data (document ID and CRDT document) and upload it to another service. Note: This functionality currently doesn't exist in the prototype.

### What happens when a client has an out of date Snapshot?

It will receive a new snapshot which will be merged into the local data.

- Automerge: `doc2 = Automerge.merge(doc2, doc1)`
- Yjs: `Yjs.applyUpdate(yDocRef.current, snapshotResult, null);`

### Why not just use the Signal Protocol, MLS or Olm/MegOlm?

All of them certainly have better security properties like Forward Secrecy and some have Post-Compromise Security.

[MLS](https://messaginglayersecurity.rocks/) looks fantastic, but is still under development, but once ready it actually might be suitable candidate to built a variation or next version of Secsync on top of it. In addition it's specification was used as inspiration e.g. security and privacy considerations.

[Signal Protocol](https://en.wikipedia.org/wiki/Signal_Protocol) is fantastic as well. With the Signal protocol though you would need to send each change to every user and requires management of one-time keys and/or established sessions. This is tougher to scale and makes it harder to support use-cases like temporary having an external contributor via a web interface.

[Olm/MegOlm](https://gitlab.matrix.org/matrix-org/olm) is also fantastic. Again the usage of one-time keys and/or established sessions make it tricky retrieve arbitrary documents without retrieving all other message from another client first.

### When to create a new Snapshot?

This highly depends on the use-case e.g. the amount of data per update and frequency. Apart from the there are

- A collaborator is added to the document. When creating a new snapshot the new collaborator only sees the current state from now on. This only works if the CRDT implementation supports tombstones e.g. [Yjs Algorithm](https://github.com/yjs/yjs#yjs-crdt-algorithm).
- The symmetric encryption is being rotated. Then the relay service can remove the previous snapshot and all related updates.

## Possible Improvements in the Future

- Add optional read notifications. From a UX perspective there can be value in being aware who has received which updates. From the perspective of the thread model it can be a tool to identify if the central relay service is excluding a collaborator.
- Using a cryptographic ratchet based on a [key derivation function (KDF)](https://en.wikipedia.org/wiki/Key_derivation_function) for updates to ensure [Forward Secrecy](https://en.wikipedia.org/wiki/Forward_secrecy).
- Leverage Zero-knowledge proofs to hide meta data. Inspired by [Signal's Private Group feature](https://signal.org/blog/private-groups/).

If you have any further ideas or suggestions please let us know.

## Setup and Run the Example

```sh
yarn
cp examples/backend/.env.example examples/backend/.env
docker-compose up
# in another tab
cd examples/backend
yarn prisma migrate dev
yarn dev
# in another tab
cd examples/frontend
yarn dev
```

## Run the example with ngrok

```sh
# get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
ngrok start --config=ngrok.yml --all --authtoken=<authtoken>
# replace the localhost urls in the code with the ngrok urls
```

## Setup fly.io deployment

Update app name inside fly.toml

```sh
fly postgres create
# store the connection string
flyctl secrets set DATABASE_URL=<db_connection_url>/secsync
```

Update DATABASE_URL in Github secrets with <db_connection_url>/secsync

## Credits

Secsync is proudly sponsored by [NGI Assure](https://nlnet.nl/assure/) via [NLNet](https://nlnet.nl).

<a href="https://nlnet.nl/assure/"><img src="https://nlnet.nl/image/logos/NGIAssure_tag.svg" alt="NLNet" width="100"></a>
