import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { createEphemeralUpdate } from "./ephemeralUpdate/createEphemeralUpdate";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  EphemeralUpdatePublicData,
  SnapshotPublicData,
  UpdatePublicData,
} from "./types";
import { createUpdate } from "./update/createUpdate";

const url = "wss://www.example.com";

let signatureKeyPair: KeyPair;
let key: Uint8Array;
let docId: string;
let snapshotId: string;

beforeEach(() => {
  docId = generateId(sodium);
  signatureKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };
});

afterEach(() => {});

type CreateSnapshotTestHelperParams = {
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  content: string;
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const { parentSnapshotCiphertext, grandParentSnapshotProof, content } =
    params || {};
  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
    parentSnapshotClocks: {},
  };

  const snapshot = createSnapshot(
    content || "Hello World",
    publicData,
    key,
    signatureKeyPair,
    parentSnapshotCiphertext || "",
    grandParentSnapshotProof || "",
    sodium
  );
  return {
    snapshot: {
      ...snapshot,
      serverData: { latestVersion: 0 },
    },
    key,
    signatureKeyPair,
  };
};

type CreateUpdateTestHelperParams = {
  version: number;
};

const createUpdateHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
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

  return { update: { ...update, serverData: { version } } };
};

const createTestEphemeralUpdate = () => {
  const publicData: EphemeralUpdatePublicData = {
    docId,
    pubKey: sodium.to_base64(signatureKeyPair.publicKey),
  };

  const ephemeralUpdate = createEphemeralUpdate(
    new Uint8Array([42]),
    publicData,
    key,
    signatureKeyPair,
    sodium
  );
  return { ephemeralUpdate };
};

it("should set _documentDecryptionState to failed if not even the snapshot can be loaded", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => {
          throw new Error("INVALID");
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (state.value === "failed") {
      expect(state.context._documentDecryptionState).toBe("failed");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });
});

it("should set _documentDecryptionState to partial and apply the first update, if document snapshot decrypts but the second update fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (state.value === "failed") {
      expect(state.context._documentDecryptionState).toBe("partial");
      expect(docValue).toEqual("Hello Worldu");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
      updates: [
        createUpdateHelper().update,
        createUpdateHelper({ version: 1000 }).update,
      ],
    },
  });
});

it("should set _documentDecryptionState to partial, if document snapshot decrypts but the first update fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (state.value === "failed") {
      expect(state.context._documentDecryptionState).toBe("partial");
      expect(docValue).toEqual("Hello World");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
      updates: [createUpdateHelper({ version: 1000 }).update],
    },
  });
});

it("should process three additional ephemeral updates where the second one fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralUpdatesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        getEphemeralUpdateKey: () => key,
        applyEphemeralUpdates: (ephemeralUpdates) => {
          ephemeralUpdatesValue = new Uint8Array([
            ...ephemeralUpdatesValue,
            ...ephemeralUpdates,
          ]);
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (ephemeralUpdatesValue.length === 2 && state.matches("connected.idle")) {
      expect(state.context._ephemeralUpdateErrors.length).toEqual(1);
      expect(ephemeralUpdatesValue[0]).toEqual(42);
      expect(ephemeralUpdatesValue[1]).toEqual(42);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const { ephemeralUpdate } = createTestEphemeralUpdate();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralUpdate,
      type: "ephemeralUpdate",
    },
  });
  setTimeout(() => {
    const { ephemeralUpdate: ephemeralUpdate2 } = createTestEphemeralUpdate();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralUpdate2,
        publicData: {
          ...ephemeralUpdate2.publicData,
          docId: "wrongDocId",
        },
        type: "ephemeralUpdate",
      },
    });
    setTimeout(() => {
      const { ephemeralUpdate: ephemeralUpdate3 } = createTestEphemeralUpdate();
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          ...ephemeralUpdate3,
          type: "ephemeralUpdate",
        },
      });
    }, 1);
  }, 1);
});

it("should store not more than 20 failed ephemeral update errors", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralUpdatesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        getEphemeralUpdateKey: () => key,
        applyEphemeralUpdates: (ephemeralUpdates) => {
          ephemeralUpdatesValue = new Uint8Array([
            ...ephemeralUpdatesValue,
            ...ephemeralUpdates,
          ]);
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (ephemeralUpdatesValue.length === 2 && state.matches("connected.idle")) {
      expect(state.context._ephemeralUpdateErrors.length).toEqual(20);
      expect(ephemeralUpdatesValue[0]).toEqual(42);
      expect(ephemeralUpdatesValue[1]).toEqual(42);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const { ephemeralUpdate } = createTestEphemeralUpdate();
  for (let step = 0; step < 25; step++) {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralUpdate,
        type: "ephemeralUpdate",
      },
    });
  }

  setTimeout(() => {
    const { ephemeralUpdate: ephemeralUpdate2 } = createTestEphemeralUpdate();
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralUpdate2,
        type: "ephemeralUpdate",
      },
    });
  }, 1);
});

it("should reset the context entries after websocket disconnect", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralUpdatesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        getEphemeralUpdateKey: () => key,
        applyEphemeralUpdates: (ephemeralUpdates) => {
          ephemeralUpdatesValue = new Uint8Array([
            ...ephemeralUpdatesValue,
            ...ephemeralUpdates,
          ]);
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (state.matches("connecting.retrying")) {
      expect(state.context._documentDecryptionState).toEqual("pending");
      expect(state.context._activeSnapshotInfo).toEqual(null);
      expect(state.context._latestServerVersion).toEqual(null);
      expect(state.context._incomingQueue).toEqual([]);
      expect(state.context._customMessageQueue).toEqual([]);
      expect(state.context._activeSendingSnapshotInfo).toEqual(null);
      expect(state.context._updatesInFlight).toEqual([]);
      expect(state.context._confirmedUpdatesClock).toEqual(null);
      expect(state.context._sendingUpdatesClock).toEqual(-1);
      expect(state.context._updateClocks).toEqual({});
      expect(
        state.context._mostRecentEphemeralUpdateDatePerPublicSigningKey
      ).toEqual({});
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
      updates: [
        createUpdateHelper().update,
        createUpdateHelper({ version: 1 }).update,
      ],
    },
  });

  syncService.send({
    type: "WEBSOCKET_DISCONNECTED",
  });
});

it("should reconnect and reload the document", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralUpdatesValue = new Uint8Array();
  let reconnected = false;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        getUpdateKey: () => key,
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          changes.forEach((change) => {
            docValue = docValue + change;
          });
        },
        getEphemeralUpdateKey: () => key,
        applyEphemeralUpdates: (ephemeralUpdates) => {
          ephemeralUpdatesValue = new Uint8Array([
            ...ephemeralUpdatesValue,
            ...ephemeralUpdates,
          ]);
        },
        sodium: sodium,
        signatureKeyPair,
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
  ).onTransition((state) => {
    if (
      reconnected &&
      state.matches("connected.idle") &&
      state.context._documentDecryptionState
    ) {
      expect(docValue).toEqual("Hello Worlduu");
      expect(state.context._documentDecryptionState).toEqual("complete");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  const document = {
    type: "document",
    snapshot,
    updates: [
      createUpdateHelper().update,
      createUpdateHelper({ version: 1 }).update,
    ],
  };
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: document,
  });

  syncService.send({
    type: "WEBSOCKET_DISCONNECTED",
  });
  setTimeout(() => {
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: document,
    });
    reconnected = true;
  }, 1);
});

// TODO
// test sending the same update twice
// testing sending the same ephemeral update twice
// tests for a broken snapshot key
// test for a invalid contributor
