import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
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
  version: number;
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

test("put changes in updatesInFlight when sending updates", (done) => {
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
  const snapshotId = snapshot.publicData.snapshotId;
  const runEvents = () => {
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
        type: "ADD_CHANGES",
        data: ["llo"],
      });

      setTimeout(() => {
        syncService.send({
          type: "ADD_CHANGES",
          data: ["World"],
        });
      }, 1);
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (state.context._updatesInFlight.length === 1) {
      expect(state.context._updatesInFlight).toStrictEqual([
        { clock: 0, snapshotId, changes: ["H", "e", "llo"] },
      ]);
    } else if (
      state.context._updatesInFlight.length === 2 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._updatesInFlight).toStrictEqual([
        { clock: 0, snapshotId, changes: ["H", "e", "llo"] },
        { clock: 1, snapshotId, changes: ["World"] },
      ]);
      expect(state.context._pendingChangesQueue).toEqual([]);
      done();
    }
  });

  syncService.start();
});

test("puts changes from updatesInFlight back to pendingChanges on Websocket disconnect", (done) => {
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
        type: "ADD_CHANGES",
        data: ["llo"],
      });
      setTimeout(() => {
        syncService.send({
          type: "DISCONNECT",
        });
      }, 1);
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (state.matches("disconnected")) {
      expect(state.context._updatesInFlight).toEqual([]);
      expect(state.context._pendingChangesQueue).toEqual(["H", "e", "llo"]);
      done();
    }
  });

  syncService.start();
});

test("allows to add changes before the document is loaded", (done) => {
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
  const snapshotId = snapshot.publicData.snapshotId;

  const runEvents = () => {
    syncService.send({
      type: "ADD_CHANGES",
      data: ["H", "e"],
    });

    setTimeout(() => {
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          type: "document",
          snapshot,
        },
      });
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (
      state.context._updatesInFlight.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._updatesInFlight).toStrictEqual([
        { clock: 0, snapshotId, changes: ["H", "e"] },
      ]);
      expect(state.context._pendingChangesQueue).toEqual([]);
      done();
    }
  });

  syncService.start();
});

test("keeps pending changes upon disconnect", (done) => {
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

  const runEvents = () => {
    syncService.send({
      type: "ADD_CHANGES",
      data: ["H", "e"],
    });

    setTimeout(() => {
      syncService.send({
        type: "DISCONNECT",
      });
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (state.matches("disconnected")) {
      expect(state.context._pendingChangesQueue).toEqual(["H", "e"]);
      done();
    }
  });

  syncService.start();
});
