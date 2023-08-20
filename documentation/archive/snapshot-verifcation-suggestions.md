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
