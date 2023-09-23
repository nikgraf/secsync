import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  SnapshotPublicData,
  SyncMachineConfig,
  UpdatePublicData,
} from "./types";
import { createUpdate } from "./update/createUpdate";

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
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  content: string;
  // Note: lacks the `parentSnapshotUpdateClocks` param from other test suites
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotId,
    parentSnapshotCiphertext,
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
    parentSnapshotCiphertext || "",
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
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async () => {
          return {
            data: "New Snapshot Data",
            id: generateId(sodium),
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            return {
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
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
        parentSnapshotCiphertext: snapshot.ciphertext,
      });

      setTimeout(() => {
        syncService.send({
          type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
          data: {
            snapshot: snapshot2,
            snapshotProofChain: [
              {
                id: snapshot2.publicData.snapshotId,
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

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches("connected.idle")).toBe(true);
      expect(docValue).toBe("Hello World1");
      done();
    }
  });

  syncService.start();
});

test("should ignore snapshot from snapshot-save-failed if already applied", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async () => {
          return {
            data: "New Snapshot Data",
            id: generateId(sodium),
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        sodium: sodium,
        signatureKeyPair: clientBKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            return {
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
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
        parentSnapshotCiphertext: snapshot.ciphertext,
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
                id: snapshot2.publicData.snapshotId,
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

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 13) {
      expect(state.matches("connected.idle")).toBe(true);
      done();
    }
  });

  syncService.start();
});

test("should apply update from snapshot-save-failed", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async () => {
          return {
            data: "New Snapshot Data",
            id: generateId(sodium),
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
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            return {
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
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

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches("connected.idle")).toBe(true);
      expect(docValue).toBe("Hello Worldu");
      done();
    }
  });

  syncService.start();
});

test("should ignore update from snapshot-save-failed if already applied", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async () => {
          return {
            data: "New Snapshot Data",
            id: generateId(sodium),
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
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            return {
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
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

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 16) {
      expect(state.matches("connected.idle")).toBe(true);
      expect(docValue).toBe("Hello Worlduu");
      done();
    }
  });

  syncService.start();
});

test("should apply update from snapshot-save-failed if it was created by the current client", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey ||
          clientBPublicKey === signingPublicKey,
        getSnapshotKey: () => key,
        getNewSnapshotData: async () => {
          return {
            data: "New Snapshot Data",
            id: generateId(sodium),
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
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            return {
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
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

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 10) {
      expect(state.matches("connected.idle")).toBe(true);
      expect(docValue).toBe("Hello Worldu");
      done();
    }
  });

  syncService.start();
});
