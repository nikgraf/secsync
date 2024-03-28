import sodium, { KeyPair } from "libsodium-wrappers";
import { createActor, fromCallback } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { defaultTestMachineInput } from "./mocks";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  SnapshotInfoWithUpdateClocks,
  SnapshotPublicData,
  UpdatePublicData,
} from "./types";
import { createUpdate } from "./update/createUpdate";
import { WebsocketActorParams } from "./utils/websocketService";

const url = "wss://www.example.com";
const docId = "6e46c006-5541-11ec-bf63-0242ac130002";

let clientAKeyPair: KeyPair;
let clientAPublicKey: string;

let clientBKeyPair: KeyPair;
let clientBPublicKey: string;

let key: Uint8Array;
let snapshotId: string;

beforeEach(async () => {
  await sodium.ready;

  clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };
  clientAPublicKey = sodium.to_base64(clientAKeyPair.publicKey);

  clientBKeyPair = {
    privateKey: sodium.from_base64(
      "ElVI9nkbOypSu2quCTXH1i1gGlcd-Sxd7S6ym9sNZj48ben-hOmefr13D9Y1Lnys3CuhwuPb6DMh_oDln913_g"
    ),
    publicKey: sodium.from_base64(
      "PG3p_oTpnn69dw_WNS58rNwrocLj2-gzIf6A5Z_dd_4"
    ),
    keyType: "ed25519",
  };
  clientBPublicKey = sodium.to_base64(clientBKeyPair.publicKey);
});

type CreateSnapshotTestHelperParams = {
  parentSnapshotId: string;
  parentSnapshotCiphertextHash: string;
  grandParentSnapshotProof: string;
  content: string;
  // Note: lacks the `parentSnapshotUpdateClocks` param from other test suites
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    grandParentSnapshotProof,
    content,
  } = params || {};
  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: clientAPublicKey,
    parentSnapshotId: parentSnapshotId || "",
    parentSnapshotUpdateClocks: {},
  };

  const snapshot = createSnapshot(
    content || "Hello World",
    publicData,
    key,
    clientAKeyPair,
    parentSnapshotCiphertextHash || "",
    grandParentSnapshotProof || "",
    sodium
  );
  return {
    snapshot,
    key,
    clientAKeyPair,
  };
};

type CreateUpdateTestHelperParams = {
  version?: number;
  signatureKeyPair?: KeyPair;
};

const createUpdateTestHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
  const signatureKeyPair = params?.signatureKeyPair || clientAKeyPair;
  const publicData: UpdatePublicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    "u",
    publicData,
    key,
    signatureKeyPair,
    version,
    sodium
  );

  return { update };
};

test("should apply snapshot from snapshot-save-failed", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    setTimeout(() => {
      const { snapshot: snapshot2 } = createSnapshotTestHelper({
        content: "Hello World1",
        grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
        parentSnapshotId: snapshot.publicData.snapshotId,
        parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      });

      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            snapshot: snapshot2,
            snapshotProofChain: [
              {
                snapshotId: snapshot2.publicData.snapshotId,
                parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
                snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
              },
            ],
            updates: [],
            type: "snapshot-save-failed",
          },
        });
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches({ connected: "idle" })).toBe(true);
      expect(docValue).toBe("Hello World1");
      done();
    }
  });

  syncService.start();
});

test("should ignore snapshot from snapshot-save-failed if already applied", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    setTimeout(() => {
      const { snapshot: snapshot2 } = createSnapshotTestHelper({
        content: "Hello World1",
        grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
        parentSnapshotId: snapshot.publicData.snapshotId,
        parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
      });

      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          snapshot: snapshot2,
          type: "snapshot",
        },
      });
      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            snapshot: snapshot2,
            snapshotProofChain: [
              {
                snapshotId: snapshot2.publicData.snapshotId,
                parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
                snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
              },
            ],
            updates: [],
            type: "snapshot-save-failed",
          },
        });
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 13) {
      expect(state.matches({ connected: "idle" })).toBe(true);
      done();
    }
  });

  syncService.start();
});

test("should apply update from snapshot-save-failed", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    setTimeout(() => {
      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            updates: [createUpdateTestHelper().update],
            type: "snapshot-save-failed",
          },
        });
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches({ connected: "idle" })).toBe(true);
      expect(docValue).toBe("Hello Worldu");
      done();
    }
  });

  syncService.start();
});

test("should ignore update from snapshot-save-failed if already applied", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    const update = createUpdateTestHelper().update;
    const update2 = createUpdateTestHelper({ version: 1 }).update;

    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...update,
        type: "update",
      },
    });

    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...update2,
        type: "update",
      },
    });

    setTimeout(() => {
      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            updates: [update],
            type: "snapshot-save-failed",
          },
        });
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 16) {
      expect(state.matches({ connected: "idle" })).toBe(true);
      expect(docValue).toBe("Hello Worlduu");
      done();
    }
  });

  syncService.start();
});

test("should apply update from snapshot-save-failed if it was created by the current client", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    // this would usually break the clock checks
    // this case can happen when an update was sent, saved on the server,
    // but the confirmation `updated-saved` not yet received
    const update = createUpdateTestHelper({
      signatureKeyPair: clientBKeyPair,
    }).update;

    setTimeout(() => {
      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            updates: [update],
            type: "snapshot-save-failed",
          },
        });
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches({ connected: "idle" })).toBe(true);
      expect(docValue).toBe("Hello Worldu");
      done();
    }
  });

  syncService.start();
});

test("should increase context._snapshotSaveFailedCounter on every snapshot-save-failed and put back the changes into the pendingChangesQueue so it can be used for the retry", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;
  let snapshotInFlight: SnapshotInfoWithUpdateClocks | undefined = undefined;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    setTimeout(() => {
      syncService.send({
        type: "ADD_CHANGES",
        data: ["H", "e"],
      });
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          type: "snapshot-save-failed",
        },
      });

      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            type: "snapshot-save-failed",
          },
        });
        setTimeout(() => {
          syncService.send({
            type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
            data: {
              type: "snapshot-saved",
              snapshotId: snapshotInFlight?.snapshotId,
            },
          });
        }, 1);
      }, 1);
    }, 1);
  };

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (state.context._snapshotInFlight) {
      snapshotInFlight = state.context._snapshotInFlight;
    }

    if (state.context._snapshotSaveFailedCounter === 2) {
      expect(state.context._snapshotSaveFailedCounter).toBe(2);
      expect(state.context._snapshotInFlight?.changes.length).toBe(0);
      expect(state.context._pendingChangesQueue.length).toBe(2);
    } else if (transitionCount === 21 && state.matches({ connected: "idle" })) {
      expect(state.context._snapshotSaveFailedCounter).toBe(0);
      expect(state.context._snapshotInFlight).toBe(null);
      expect(state.context._pendingChangesQueue.length).toBe(0);
      done();
    }
  });

  syncService.start();
});

test("should reset context._snapshotSaveFailedCounter on snapshot-saved event", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let snapshotInFlight: SnapshotInfoWithUpdateClocks | undefined = undefined;
  let docValue = "";
  const onDocumentUpdated = jest.fn();
  const { snapshot } = createSnapshotTestHelper();

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
        shouldSendSnapshot: () => true,
        getNewSnapshotData: async ({ id }) => {
          return {
            id,
            data: "NEW SNAPSHOT DATA",
            key,
            publicData: {},
          };
        },
        onDocumentUpdated,
        // @ts-expect-error overwriting internal context for the test
        _snapshotSaveFailedCounter: 2,
      },
    }
  );

  syncService.subscribe((state) => {
    if (state.context._snapshotInFlight) {
      snapshotInFlight = state.context._snapshotInFlight;
    }

    if (
      state.matches({ connected: "idle" }) &&
      state.context._snapshotInfosWithUpdateClocks.length === 2 &&
      state.context._snapshotInfosWithUpdateClocks[1].snapshotId ===
        snapshotInFlight?.snapshotId
    ) {
      expect(state.context._snapshotSaveFailedCounter).toBe(0);
      expect(docValue).toEqual("Hello Worlduu");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
      updates: [
        createUpdateTestHelper().update,
        createUpdateTestHelper({ version: 1 }).update,
      ],
    },
  });

  setTimeout(() => {
    syncService.send({
      type: "ADD_CHANGES",
      data: ["H", "e"],
    });
    setTimeout(() => {
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          type: "snapshot-saved",
          snapshotId: snapshotInFlight?.snapshotId,
        },
      });
    }, 1);
  }, 1);
});

test("should reset context._snapshotSaveFailedCounter on update-saved event", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let snapshotInFlight: SnapshotInfoWithUpdateClocks | undefined = undefined;
  let docValue = "";
  const onDocumentUpdated = jest.fn();
  const { snapshot } = createSnapshotTestHelper();

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
        shouldSendSnapshot: () => false,
        getNewSnapshotData: async ({ id }) => {
          return {
            id,
            data: "NEW SNAPSHOT DATA",
            key,
            publicData: {},
          };
        },
        onDocumentUpdated,
        // @ts-expect-error overwriting internal context for the test
        _snapshotSaveFailedCounter: 2,
      },
    }
  );

  syncService.subscribe((state) => {
    if (state.context._snapshotInFlight) {
      snapshotInFlight = state.context._snapshotInFlight;
    }

    if (
      state.matches({ connected: "idle" }) &&
      state.context._snapshotSaveFailedCounter === 0
    ) {
      expect(state.context._snapshotSaveFailedCounter).toBe(0);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  setTimeout(() => {
    syncService.send({
      type: "ADD_CHANGES",
      data: ["H", "e"],
    });
    setTimeout(() => {
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          type: "update-saved",
        },
      });
    }, 1);
  }, 1);
});

test("should disconnect and reconnect after 5 snapshot-save-failed", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      },
    }
  );

  const runEvents = () => {
    const { snapshot } = createSnapshotTestHelper();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
      },
    });

    setTimeout(() => {
      syncService.send({
        type: "ADD_CHANGES",
        data: ["H", "e"],
      });
      for (let i = 0; i < 6; i++) {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            type: "snapshot-save-failed",
          },
        });
      }
    }, 1);
  };

  let didReconnectWithPendingChanges = false;

  syncService.subscribe((state) => {
    transitionCount = transitionCount + 1;
    if (transitionCount === 3) {
      runEvents();
    }

    if (
      state.matches({ connecting: "retrying" }) &&
      state.context._pendingChangesQueue.length === 0
    ) {
      didReconnectWithPendingChanges = true;
    }
    if (
      state.context._pendingChangesQueue.length === 2 &&
      state.matches({ connected: "idle" })
    ) {
      expect(state.context._snapshotSaveFailedCounter).toBe(0);
      expect(didReconnectWithPendingChanges).toBe(true);
      done();
    }
  });

  syncService.start();
});
