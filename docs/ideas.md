## Verifying Snapshots

It should not be possible for the server to send a client an old snapshot if the client has a reference to a newer one. The purpose is to reduce the attack vector that the server can send an old snapshot.

### Option A

The best option would be cryptographic accumulator where the set of membership entries are the snapshot IDs. The benefit is that cryptographic accumulators are constant size, but still it would be possible to verify the server is sending a snapshot which includes the last snapshot a client is aware of.

A solid and efficient cryptographic accumulator available in JavaScript is probably a research project by itself.

### Option B

A hash chain could be used. Users would store the hash of the last seen snapshot, and when requesting a new version the server send the snapshot and all hashes and hashinformation to reconstruct the chain.

This probably has quite an overhead.

### Option C

A logical clock that is signed by the users. Users would only need to store the latest version they know.

## Users and devices

To verify that a device & user are connected we can use signing in both directions. The user can sign the device's public keys and the device can sign the user keys.

If it would be only one way e.g. user signs device keys then some other user could also sign them and content could be shown as created by that user. Even if users can overwrite content as their own this can be still relevant for older the snapshot history.

## Visualize which user made which change

- In Automerge the user or device public should be used as an ID.
- In Yjs the clientID seems to be generated (TODO ask Kevin if it's possible to set it manually and the implications if two clients would have the same ID and edit offline)

### Possible Meta data issues

- Should users be able to identify which device of a user made a certain change?

