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
  content?: string;
};

const createUpdateTestHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
  const content = params?.content || "u";
  const publicData: UpdatePublicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: clientAPublicKey,
  };

  const update = createUpdate(
    content,
    publicData,
    key,
    clientAKeyPair,
    version,
    sodium
  );

  return { update: { ...update, serverData: { version } } };
};

const createEphemeralMessageTestHelper = ({
  messageType,
  receiverSessionId,
  content,
}: {
  messageType: "proof" | "message";
  receiverSessionId: string;
  content?: Uint8Array;
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
      content ? content : new Uint8Array([22]),
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

test("process three additional ephemeral messages where the second is ignored since the docId has been manipulated", (done) => {
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
      expect(state.context._ephemeralMessageReceivingErrors.length).toEqual(1);
      // the message with 44 has been ignored
      expect(ephemeralMessagesValue[0]).toEqual(55);
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

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
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
    const { ephemeralMessage: ephemeralMessage2 } =
      createEphemeralMessageTestHelper({
        messageType: "message",
        receiverSessionId,
        content: new Uint8Array([44]),
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
        createEphemeralMessageTestHelper({
          messageType: "message",
          receiverSessionId,
          content: new Uint8Array([55]),
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

test("ignore an ephemeral message coming from a reply attack", (done) => {
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
      ephemeralMessagesValue.length === 2 &&
      state.matches("connected.idle")
    ) {
      expect(ephemeralMessagesValue[0]).toEqual(22);
      expect(ephemeralMessagesValue[1]).toEqual(55);
      // the message with 22 from the reply attack is ignored
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

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
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
    const { ephemeralMessage: ephemeralMessage2 } =
      createEphemeralMessageTestHelper({
        messageType: "message",
        receiverSessionId,
      });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...ephemeralMessage2,
        type: "ephemeral-message",
      },
    });
    setTimeout(() => {
      syncService.send({
        type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
        data: {
          ...ephemeralMessage2,
          type: "ephemeral-message",
        },
      });
      setTimeout(() => {
        const { ephemeralMessage: ephemeralMessage3 } =
          createEphemeralMessageTestHelper({
            messageType: "message",
            receiverSessionId,
            content: new Uint8Array([55]),
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
  }, 1);
});

test("should ignore an update in case it's a reply attack with the same update", (done) => {
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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
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
    if (docValue === "Hello Worlduo") {
      // 'u' was only applied once
      expect(state.context._documentDecryptionState).toBe("complete");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  expect(syncService.getSnapshot().context._documentDecryptionState).toBe(
    "pending"
  );

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const { update } = createUpdateTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update,
      type: "update",
    },
  });

  // this is the reply attack update that should be ignored
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update,
      type: "update",
    },
  });

  const { update: update2 } = createUpdateTestHelper({
    version: 1,
    content: "o",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update2,
      type: "update",
    },
  });
});

test("should ignore an update in case it's a different update, but the same clock", (done) => {
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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
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
    if (docValue === "Hello Worldub") {
      // 'a' between 'u' and 'b' was ignored
      expect(state.context._documentDecryptionState).toBe("complete");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  expect(syncService.getSnapshot().context._documentDecryptionState).toBe(
    "pending"
  );

  const { snapshot } = createSnapshotTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });

  const { update } = createUpdateTestHelper();
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update,
      type: "update",
    },
  });

  const { update: update2 } = createUpdateTestHelper({
    version: 0,
    content: "a",
  });

  // this is the reply attack update that should be ignored
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update2,
      type: "update",
    },
  });

  const { update: update3 } = createUpdateTestHelper({
    version: 1,
    content: "b",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update3,
      type: "update",
    },
  });
});
