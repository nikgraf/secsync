## Goal

The goal is to develop an architecture and with it a protocol to allow multiple users to collaborate on a CRDT based data structure in an end-to-end encrypted way.

## Requirements

### Actors

- `User` represents a person interacting with the content.
- `Client` represents the actual instance connecting to the service. A user can have one or multiple clients at the same time.
- `Service` represents the server responsible to receive, persist and deliver information to the clients.

### Business Requirements

- The content must be end-to-end encrypted.
- The same user must be able to interact on the same document with multiple clients.
- Clients must not see each others IP addresses.
- When activated it must be possible to identify who wrote which content.
- The user must be able to start or stop sending and/or receiving updates and be able to send updates batched later.

### System level Requirements

#### Data exchange

- Must support asynchronous exchange of data. This means participants don't have to be online at the same time, but still can exchange data.
- Must support real-time exchange incl. awareness features e.g. cursor position.
- The architecture must support clients that have to rebuild the CRDT based data structure from ground up.
- The architecture must support local-first clients. These clients can be offline for a while and only sync later once they are connected again.
- The architecture must support multiple CRDT implementations. In detail this means Naisho is a layer on top of a data type, where the operations are commutative. In particular Yjs and automerge should be supported.
- The architecture can, but must not be decentralized. Leveraging a centralized service is a viable option.

#### Security

- The content of a document must only be accessible to the participants.
- There are no limitations on meta data e.g. who created how many changes.

#### Authorization

The architecture should support two main use-cases:

- A: Everyone with access to the document ID can retrieve data and only with the shared secret can decrypt it e.g. `www.example.com/doc/{id}#{pake of the shared key}` would allow multiple anonymous participants to collaborate.
- B: Everyone is verifiable through a private-public keypair. The keypairs could come from any kind of Public-Key Infrastructure or Web of Trust system. The scenario here is close groups where the public keys are verified.

## Threat Model

### Confidentiality

In content change sent by a user can only be decrypted by users with access to the shared secret.

### Integrity

Content updated cannot be undetectably modified by anyone but the client which created it.

### Authentication

The sender of a content update cannot be forged.

In use-case A every client aware of the document ID can send a content update, but won't be accepted by the other clients in case the shared secret doesn't match.
In use-case B every client aware of the document ID can send a content update, but won't be accepted by the other clients in case it came from a non verifable client (via the signing key) as well as in case the shared secret doesn't match.

### Eventual consistency

All clients receive the same set of content updates (possibly in different orders), and all clients converge to the same view of the document state as they receive the same set of control content updates.

### Network

Adversaries may access data sent over the network.
Adversaries may access data that is stored at the service that relays the data.
