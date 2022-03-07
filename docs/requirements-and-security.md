## Goal

The goal is to develop an architecture and with it a protocol to allow multiple participants to collaborate on a CRDT based data structure in an end-to-end encrypted way.

## Requirements

### Business Requirements

- The same user must be able to interact on the same document with multiple devices.
- When adding a user to a document it must be possible to discard the complete content in the history (except for CRDT tombstones).
- It must be possible to identify who wrote which content.
- The content must be end-to-end encrypted.
- The user must be able to activate a zen/focus mode and send updates batched later.
- Clients must not see each others IP addresses.

## System level Requirements

### Data exchange

- Must support asynchronous exchange of data. This means participants don't have to be online at the same time, but still can exchange data.
- Must support real-time exchange incl. awareness features e.g. cursor position.
- The architecture must support clients that have to rebuild the CRDT based data structure from ground up.
- The architecture must support local-first clients. These clients can be offline for a while and only sync later once they are connected again.
- The architecture must support multiple CRDT implementations. In detail this means Naisho is a layer on top of a data type, where the operations are commutative. In particular Yjs and automerge should be supported.
- The architecture can, but must not be decentralized. Leveraging a centralized service is a viable option.

### Security

- The content of a document must only be accessible to the participants.
- There are no limitations on meta data e.g. who created how many changes.

### Authorization

The architecture should support two main use-cases:

- A: Everyone with access to the document ID can retrieve data and only with the shared secret can decrypt it e.g. `www.example.com/doc/{id}#{pake of the shared key}` would allow multiple anonymous participants to collaborate.
- B: Everyone is verifiable through a private-public keypair. The keypairs could come from any kind of Public-Key Infrastructure or Web of Trust system. The scenario here is close groups where the public keys are verified.

## Tread & Trust Model

### Thread Model

- Adversaries may access data sent over the network.
- Adversaries may access data that is stored at the server/service that relays the data.

### Trust Model

- In the use-case A every participant with access to the private key is to be fully trusted.
- In the use-case B every participant with valid private-public keypair is to be fully trusted and can be malicious.

### Clarification

One or multiple servers may be used to exchange the data between clients. This server or servers can behave malicious. Whenever it does it will be detected except when it deliberately denies access to data.
