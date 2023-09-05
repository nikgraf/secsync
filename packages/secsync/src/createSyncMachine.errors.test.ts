import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { createEphemeralMessage } from "./ephemeralMessage/createEphemeralMessage";
import { createEphemeralSession } from "./ephemeralMessage/createEphemeralSession";
import { createEphemeralMessageProof } from "./ephemeralMessage/createEphemeralSessionProof";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  EphemeralMessagePublicData,
  SnapshotClocks,
  SnapshotPublicData,
  UpdatePublicData,
} from "./types";
import { createUpdate } from "./update/createUpdate";

const url = "wss://www.example.com";

let clientAKeyPair: KeyPair;
let clientAPublicKey: string;
let clientACounter: number;
let clientASessionId: string;
let clientAPublicData: EphemeralMessagePublicData;

let clientBKeyPair: KeyPair;
let clientBPublicKey: string;
let clientBSessionId: string;
let clientBPublicData: EphemeralMessagePublicData;

let key: Uint8Array;
let docId: string;
let snapshotId: string;

beforeEach(async () => {
  await sodium.ready;
  docId = generateId(sodium);

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
  clientAPublicData = {
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: clientAPublicKey,
  };
  clientASessionId = generateId(sodium);
  clientACounter = 0;

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
  clientBSessionId = generateId(sodium);
});

type CreateSnapshotTestHelperParams = {
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  content: string;
  parentSnapshotClocks?: SnapshotClocks;
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotCiphertext,
    grandParentSnapshotProof,
    content,
    parentSnapshotClocks,
  } = params || {};
  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: clientAPublicKey,
    parentSnapshotClocks: parentSnapshotClocks || {},
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
    snapshot: {
      ...snapshot,
      serverData: { latestVersion: 0 },
    },
    key,
    signatureKeyPair: clientAKeyPair,
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
    pubKey: clientAPublicKey,
  };

  const update = createUpdate(
    "u",
    publicData,
    key,
    clientAKeyPair,
    version,
    sodium
  );

  return { update: { ...update, serverData: { version } } };
};

const createTestEphemeralMessage = ({
  messageType,
  receiverSessionId,
}: {
  messageType: "proof" | "message";
  receiverSessionId: string;
}) => {
  if (messageType === "proof") {
    const proof = createEphemeralMessageProof(
      receiverSessionId,
      clientASessionId,
      clientAKeyPair,
      sodium
    );

    const ephemeralMessage = createEphemeralMessage(
      proof,
      "proof",
      clientAPublicData,
      key,
      clientAKeyPair,
      clientASessionId,
      clientACounter,
      sodium
    );
    clientACounter++;
    return { ephemeralMessage };
  } else {
    const ephemeralMessage = createEphemeralMessage(
      new Uint8Array([22]),
      "message",
      clientAPublicData,
      key,
      clientAKeyPair,
      clientASessionId,
      clientACounter,
      sodium
    );
    clientACounter++;
    return { ephemeralMessage };
  }
};

test("should set _documentDecryptionState to failed if not even the snapshot can be loaded", (done) => {
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
          clientAPublicKey === signingPublicKey,
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
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
  syncService.send({ type: "WEBSOCKET_RETRY" });
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

test("should set _documentDecryptionState to partial and apply the first update, if document snapshot decrypts but the second update fails", (done) => {
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
          clientAPublicKey === signingPublicKey,
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
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
  syncService.send({ type: "WEBSOCKET_RETRY" });
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

test("should set _documentDecryptionState to partial, if document snapshot decrypts but the first update fails", (done) => {
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
          clientAPublicKey === signingPublicKey,
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
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
  syncService.send({ type: "WEBSOCKET_RETRY" });
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

test("should process three additional ephemeral messages where the second one fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        getEphemeralMessageKey: () => key,
        applyEphemeralMessages: (ephemeralMessages) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ...ephemeralMessages,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
      ephemeralMessagesValue.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._receivingEphemeralMessageErrors.length).toEqual(1);
      expect(ephemeralMessagesValue[0]).toEqual(22);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const receiverSessionId =
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createTestEphemeralMessage({
    messageType: "proof",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      type: "ephemeral-message",
    },
  });

  setTimeout(() => {
    const { ephemeralMessage: ephemeralMessage2 } = createTestEphemeralMessage({
      messageType: "message",
      receiverSessionId,
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralMessage2,
        publicData: {
          ...ephemeralMessage2.publicData,
          docId: "wrongDocId",
        },
        type: "ephemeral-message",
      },
    });
    setTimeout(() => {
      const { ephemeralMessage: ephemeralMessage3 } =
        createTestEphemeralMessage({
          messageType: "message",
          receiverSessionId,
        });
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          ...ephemeralMessage3,
          type: "ephemeral-message",
        },
      });
    }, 1);
  }, 1);
});

test("should store not more than 20 failed ephemeral message errors", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        getEphemeralMessageKey: () => key,
        applyEphemeralMessages: (ephemeralMessages) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ...ephemeralMessages,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
      ephemeralMessagesValue.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._receivingEphemeralMessageErrors.length).toEqual(20);
      expect(ephemeralMessagesValue[0]).toEqual(22);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const receiverSessionId =
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createTestEphemeralMessage({
    messageType: "proof",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      type: "ephemeral-message",
    },
  });

  for (let step = 0; step < 25; step++) {
    const { ephemeralMessage: ephemeralMessageX } = createTestEphemeralMessage({
      messageType: "message",
      receiverSessionId,
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralMessageX,
        signature: "BROKEN",
        type: "ephemeral-message",
      },
    });
  }

  const { ephemeralMessage: ephemeralMessageLast } = createTestEphemeralMessage(
    {
      messageType: "message",
      receiverSessionId,
    }
  );
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessageLast,
      type: "ephemeral-message",
    },
  });
});

test("should reset the context entries after websocket disconnect", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        getEphemeralMessageKey: () => key,
        applyEphemeralMessages: (ephemeralMessages) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ...ephemeralMessages,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
      expect(state.context._ephemeralMessagesSession).not.toBe(null);
      expect(state.context._receivingEphemeralMessageErrors).toEqual([]);
      expect(state.context._creatingEphemeralMessageErrors).toEqual([]);
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
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

test("should reconnect and reload the document", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();
  let reconnected = false;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        getEphemeralMessageKey: () => key,
        applyEphemeralMessages: (ephemeralMessages) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ...ephemeralMessages,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
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
  syncService.send({ type: "WEBSOCKET_RETRY" });
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
    syncService.send({ type: "WEBSOCKET_RETRY" });
    syncService.send({ type: "WEBSOCKET_CONNECTED" });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: document,
    });
    reconnected = true;
  }, 1);
});

test("should store not more than 20 failed creating ephemeral message errors", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        getEphemeralMessageKey: () => key,
        applyEphemeralMessages: (ephemeralMessages) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ...ephemeralMessages,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      })
      .withConfig({
        actions: {
          spawnWebsocketActor: assign((context) => {
            const ephemeralMessagesSession = createEphemeralSession(
              context.sodium
            );
            return {
              _ephemeralMessagesSession: ephemeralMessagesSession,
              _websocketActor: spawn(
                websocketServiceMock(context),
                "websocketActor"
              ),
            };
          }),
        },
      })
  ).onTransition((state) => {
    transitionCount = transitionCount + 1;
    // console.log("transitionCount", transitionCount);
    if (transitionCount === 27 && state.matches("connected.idle")) {
      expect(state.context._creatingEphemeralMessageErrors.length).toEqual(20);
      expect(state.context._creatingEphemeralMessageErrors[0].message).toEqual(
        `Wrong ephemeral message key #${23}`
      );
      expect(state.context._creatingEphemeralMessageErrors[19].message).toEqual(
        `Wrong ephemeral message key #${4}`
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  for (let step = 0; step < 25; step++) {
    syncService.send({
      type: "FAILED_CREATING_EPHEMERAL_UPDATE",
      error: new Error(`Wrong ephemeral message key #${step}`),
    });
  }
});

// TODO
// test sending the same update twice (2nd one being ignore)
// testing sending the same ephemeral message twice
// tests for a broken snapshot key
// test for a invalid contributor
// test to verify a reply attack with older ephemeral messages are rejected
