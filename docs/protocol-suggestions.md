## Protocol Prototypes

### Non-overlapping Snapshots

In this version clients would be allowed to create snapshots and updates that are related to a snapshot. There is only one snapshot allowed at the time, meaning the current state of a document would be constructed out of one snapshot and all their updates.

Open questions:

- Can snapshots be connected and verified without downloading all of them?
- Does the one snapshot rule cause a lot of complexity?

### Overlapping Snapshots

In this version clients would be allowed to create snapshots and updates that are related to a snapshot. Snapshots can be overlapping, meaning the current state of a document would be constructed out of multiple snapshots and all their updates.

Open questions:

- Can snapshots be connected and verified without downloading all of them?
- How does this impact privacy e.g. visibility of previous changes for new collaborators?
- How is the performance loading of a document compared to the other versions?

### Events only

In this version clients only can create updates. This version has the benefit of its verifiability to the beginning.

- How does this impact privacy e.g. visibility of previous changes for new collaborators?
- How is the performance loading of a document compared to the other versions?
