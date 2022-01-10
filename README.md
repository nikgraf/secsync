# Naisho

Is an architecture for end-to-end encrypted CRDTs.

## Demos

- End-to-end encrypted document https://www.naisho.org/

## Background

In architectures without end-to-end encryption a backend service can merge all updates together to one document and serve it to clients. In case a client already has a large part of the document the backend service can only send the missing updates.

In an end-to-end encrypted architecture the backend service does not have access to the data.

## Goals

Goal of this project is an architecture that allows for an efficient data fetching/synchronisation for end-to-end encrypted CRDT documents using a single webservice to do so.

Use-cases to cover:

- A client (e.g. web) with no local state must be able to retrieve a full document.
- A client (e.g. mobile) with local state must be able to retrieve recent changes to a document.

Security goals

- The server can not inject any updates to a document.
- The server can not withhold updates of a document and send others without being dedected.

## Not in scope for now (but possibly for future version)

- Support for a federated or co-federated system
- Support for decentralization
- Support for existing/upcoming encryption protocols (MLS, Megolm, DCGKA)
- Support for integrated forward secrecy using KDF ratchets

## Assumptions

- Each client fully trusts each other client
- Each client has a signature key pair and there is an established method to encrypt and decrypt messages between clients. (there will be a demo using lockboxes and/or Matrix's Olm/Megolm, but MLS or DCGKA should work as well)

## Why use a central server?

- To store data so it can be retreived asynchronous (others don't have to be online).
- To create a single stream of snapshots and updates for easier synchronisation. (avoids handling complex problems like topological sorting for DAGs … for now)

## Architecture

A document is represented by one entity on the server. Each document has one currently active snapshot and each conntected client can attach updates to a snapshot.

<img src="./docs/overview.png?raw=true" width="247" height="573" alt="Relationship between Snapshots and Updates" />

TODO

- Document
- Snapshot
- Update (signature chain per user per snapshot)

There is a certain symbiosis between the server and the clients. That said there are clear boundaries in terms when it comes to authenticity of data to make it verifyable end-to-end.

TODO how can you trust the server with snapshots?

TODO Idea: always have two active snapshots? easier to accept updates, it's not that simple and clear anymore

### When to create a new Snapshot?

- A user is removed from the document to enforce that no one can continue sharing updates with removed users.
- A user is added to the document to make sure the new users only sees the current state from now on. The background is a privacy by default thinking.
- The symmetric encryption is being rotated.

Depending on the clients there can be different strategies:

- When most clients don't store the state locally, but rather fetch the latest snapshot + updates, then snapshots should be produced more often.
- When most clients store the state locally and regularily sync then regular snapshots are not desired.

## Benefits

- When a collaborator leaves we can simply create a new snapshot we new key material.
- When adding a collaborator and we create a new snapshot content of old changes are not revealed if the CRDT implementation supports tombstones e.g. Yjs.

## Open Questions

- Can the Poly1305 MAC be omitted since every message is anyway signed with the private key?

## Setup and Run the Demo

```sh
yarn
cp demos/backend/.env.example demos/backend/.env
docker-compose up
# in another tab
cd demos/backend
yarn prisma migrate dev
yarn dev
# in another tab
cd demos/frontend
yarn dev
```

## Credits

Naisho is proudly sponsored by [NGI Assure](https://nlnet.nl/assure/) via [NLNet](https://nlnet.nl).

<a href="https://nlnet.nl/assure/"><img src="https://nlnet.nl/image/logos/NGIAssure_tag.svg" alt="NLNet" width="100"></a>
