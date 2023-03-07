## Users and devices

To verify that a device & user are connected we can use signing in both directions. The user can sign the device's public keys and the device can sign the user keys.

If it would be only one way e.g. user signs device keys then some other user could also sign them and content could be shown as created by that user. Even if users can overwrite content as their own this can be still relevant for older the snapshot history.

## Visualize which user made which change

- In Automerge the user or device public should be used as an ID.
- In Yjs the clientID seems to be generated (TODO ask Kevin if it's possible to set it manually and the implications if two clients would have the same ID and edit offline)

### Possible Meta data issues

- Should users be able to identify which device of a user made a certain change?
