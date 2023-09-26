import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  SnapshotPublicData,
  SnapshotUpdateClocks,
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
  parentSnapshotCiphertextHash: string;
  grandParentSnapshotProof: string;
  content: string;
  parentSnapshotUpdateClocks?: SnapshotUpdateClocks;
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    grandParentSnapshotProof,
    parentSnapshotUpdateClocks,
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
    parentSnapshotUpdateClocks: parentSnapshotUpdateClocks || {},
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
  version: number;
  content?: string;
  signatureKeyPair?: KeyPair;
};

const createUpdateTestHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
  const signatureKeyPair = params?.signatureKeyPair || clientAKeyPair;
  const content = params?.content || "u";
  const publicData: UpdatePublicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const update = createUpdate(
    content,
    publicData,
    key,
    signatureKeyPair,
    version,
    sodium
  );

  return { update };
};

test("reconnect and receive the same snapshot with one more update", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();

  syncService.onTransition((state, event) => {
    if (docValue === "Hello Worldu") {
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({});
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
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
        updates: [createUpdateTestHelper().update],
      },
    });
  }, 1);
});

test("fetch a snapshot with an update, reconnect and receive the same snapshot with one more update: snapshot is ignored, update applied", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

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
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {},
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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();
  const { update } = createUpdateTestHelper();

  syncService.onTransition((state, event) => {
    if (docValue === "ux") {
      expect(state.context.loadDocumentParams?.mode).toEqual("delta");
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({
        "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 0,
      });
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
      updates: [update],
    },
  });

  setTimeout(() => {
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot,
        updates: [
          update,
          createUpdateTestHelper({ version: 1, content: "x" }).update,
        ],
      },
    });
  }, 1);
});

test("fetch a snapshot with an update, reconnect and receive the another snapshot", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

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
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {},
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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();
  const { update } = createUpdateTestHelper();

  syncService.onTransition((state, event) => {
    if (state.value === "failed") {
      expect(state.context);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_112"
      );
      expect(state.context.loadDocumentParams?.mode).toEqual("delta");
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({
        "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 0,
      });
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
      updates: [update],
    },
  });

  setTimeout(() => {
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshot: createSnapshotTestHelper().snapshot,
      },
    });
  }, 1);
});

test("fetch a snapshot with an update, reconnect and receive only a new update", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

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
        getNewSnapshotData: async ({ id }) => {
          return {
            data: "New Snapshot Data",
            key,
            publicData: {},
          };
        },
        applySnapshot: (snapshot) => {},
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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();
  const { update } = createUpdateTestHelper();

  syncService.onTransition((state, event) => {
    if (docValue === "uu") {
      expect(state.context.loadDocumentParams?.mode).toBe("delta");
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({
        "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 0,
      });
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
      updates: [update],
    },
  });

  setTimeout(() => {
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        updates: [createUpdateTestHelper({ version: 1 }).update],
      },
    });
  }, 1);
});

test("reconnect and receive a new snapshot", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";

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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();
  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    parentSnapshotUpdateClocks: {},
    content: "Hello World again",
  });

  syncService.onTransition((state, event) => {
    if (docValue === "Hello World again") {
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({});
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
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshotProofChain: [
          {
            snapshotId: snapshot2.publicData.snapshotId,
            parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
            snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
          },
        ],
        snapshot: snapshot2,
      },
    });
  }, 1);
});

test("reconnect and receive a new snapshot where one more was in between", (done) => {
  const onReceive = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(onReceive);

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";

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
        // logging: "error",
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

  const { snapshot } = createSnapshotTestHelper();
  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    parentSnapshotUpdateClocks: {},
    content: "Hello World again",
  });
  const { snapshot: snapshot3 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
    grandParentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
    parentSnapshotUpdateClocks: {},
    content: "Hello World again and again",
  });

  syncService.onTransition((state, event) => {
    if (docValue === "Hello World again and again") {
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.parentSnapshotProof
      ).toEqual(snapshot.publicData.parentSnapshotProof);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.snapshotId
      ).toEqual(snapshot.publicData.snapshotId);
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo
          .snapshotCiphertextHash
      ).toEqual(hash(snapshot.ciphertext, sodium));
      expect(
        state.context.loadDocumentParams?.knownSnapshotInfo.updateClocks
      ).toEqual({});
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
    syncService.send({ type: "WEBSOCKET_DISCONNECTED" });
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "document",
        snapshotProofChain: [
          {
            snapshotId: snapshot2.publicData.snapshotId,
            parentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
            snapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
          },
          {
            snapshotId: snapshot3.publicData.snapshotId,
            parentSnapshotProof: snapshot3.publicData.parentSnapshotProof,
            snapshotCiphertextHash: hash(snapshot3.ciphertext, sodium),
          },
        ],
        snapshot: snapshot3,
      },
    });
  }, 1);
});
