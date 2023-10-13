import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { createEphemeralMessage } from "./ephemeralMessage/createEphemeralMessage";
import { createEphemeralSession } from "./ephemeralMessage/createEphemeralSession";
import { createEphemeralMessageProof } from "./ephemeralMessage/createEphemeralSessionProof";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  EphemeralMessagePublicData,
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
let clientACounter: number;
let clientASessionId: string;
let clientAPublicData: EphemeralMessagePublicData;

let clientBKeyPair: KeyPair;
let clientBPublicKey: string;
let clientBSessionId: string;
let clientBPublicData: EphemeralMessagePublicData;

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
  clientAPublicData = {
    docId,
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
  parentSnapshotId?: string;
  parentSnapshotCiphertextHash?: string;
  grandParentSnapshotProof?: string;
  content?: string;
  parentSnapshotUpdateClocks?: SnapshotUpdateClocks;
  key?: Uint8Array;
  docId?: string;
  signingKeyPair?: KeyPair;
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotId,
    parentSnapshotCiphertextHash,
    grandParentSnapshotProof,
    content,
    parentSnapshotUpdateClocks,
    key: customKey,
    docId: customDocId,
    signingKeyPair: customSigningKeyPair,
  } = params || {};
  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const signingKeyPair = customSigningKeyPair || clientAKeyPair;

  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: customDocId || docId,
    pubKey: sodium.to_base64(signingKeyPair.publicKey),
    parentSnapshotId: parentSnapshotId || "",
    parentSnapshotUpdateClocks: parentSnapshotUpdateClocks || {},
  };

  const snapshot = createSnapshot(
    content || "Hello World",
    publicData,
    customKey || key,
    signingKeyPair,
    parentSnapshotCiphertextHash || "",
    grandParentSnapshotProof || "",
    sodium
  );
  return {
    snapshot,
    key,
    signatureKeyPair: clientAKeyPair,
  };
};

type CreateUpdateTestHelperParams = {
  version?: number;
  content?: string;
  key?: Uint8Array;
  snapshotId?: string;
};

const createUpdateTestHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
  const content = params?.content || "u";
  const updateKey = params?.key || key;
  const refSnapshotId = params?.snapshotId || snapshotId;
  const publicData: UpdatePublicData = {
    refSnapshotId,
    docId,
    pubKey: clientAPublicKey,
  };

  const update = createUpdate(
    content,
    publicData,
    updateKey,
    clientAKeyPair,
    version,
    sodium
  );

  return { update };
};

const createEphemeralMessageTestHelper = ({
  messageType,
  receiverSessionId,
  content,
  key: customKey,
}: {
  messageType: "proof" | "message" | "invalid";
  receiverSessionId: string;
  content?: Uint8Array;
  key?: Uint8Array;
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
      customKey || key,
      clientAKeyPair,
      clientASessionId,
      clientACounter,
      sodium
    );
    clientACounter++;
    return { ephemeralMessage };
  } else if (messageType === "message") {
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
  } else {
    const ephemeralMessage = createEphemeralMessage(
      content ? content : new Uint8Array([22]),
      // @ts-expect-error
      "invalid",
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

test("SECSYNC_ERROR_101 snapshot decryption fails on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_101"
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper({
    key: sodium.from_hex(
      "994b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
    ),
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });
});

test("SECSYNC_ERROR_101 snapshot decryption fails on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_101"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
    key: sodium.from_hex(
      "994b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
    ),
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_102 invalid parentSnapshot verification on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("failed")
    ) {
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_102"
      );
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
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "update-saved",
      snapshotId: snapshot.publicData.snapshotId,
      clock: 1,
    },
  });

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    parentSnapshotUpdateClocks: {
      [clientAPublicKey]: 0,
    },
    content: "Hello World again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_103 getSnapshotKey threw an error on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
        getSnapshotKey: () => {
          throw new Error("NO SNAPSHOT KEY");
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_103"
      );
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

test("SECSYNC_ERROR_103 getSnapshotKey threw an error on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let snapshotKeyCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
        getSnapshotKey: () => {
          if (snapshotKeyCounter === 0) {
            snapshotKeyCounter++;
            return key;
          } else {
            throw new Error("NO SNAPSHOT KEY");
          }
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
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_103"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_104 isValidClient threw an error on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          throw new Error("NO SNAPSHOT KEY");
        },
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_104"
      );
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

test("SECSYNC_ERROR_104 isValidClient threw an error on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (signingPublicKey === clientBPublicKey) {
            throw new Error("NO SNAPSHOT KEY");
          }
          return true;
        },
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
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_104"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
    signingKeyPair: clientBKeyPair,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_105 applySnapshot threw an error", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          // docValue = sodium.to_string(snapshot);
          throw new Error("FAILED TO APPLY SNAPSHOT");
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_105"
      );
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

test("SECSYNC_ERROR_105 applySnapshot threw an error", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let applySnapshotCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          if (applySnapshotCounter === 0) {
            applySnapshotCounter++;
            docValue = sodium.to_string(snapshot);
          } else {
            throw new Error("FAILED TO APPLY SNAPSHOT");
          }
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
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_105"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_110 snapshot message does not parse on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_110"
      );
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
      snapshot: {
        ...snapshot,
        publicData: {
          ...snapshot.publicData,
          docId: undefined,
        },
      },
    },
  });
});

test("SECSYNC_ERROR_110 snapshot message does not parse on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_110"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: {
        ...snapshot2,
        publicData: {
          ...snapshot2.publicData,
          docId: undefined,
        },
      },
    },
  });
});

test("SECSYNC_ERROR_111 invalid signature on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_111"
      );
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
      snapshot: {
        ...snapshot,
        signature: "INVALID_SIGNATURE",
      },
    },
  });
});

test("SECSYNC_ERROR_111 invalid signature on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_111"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: {
        ...snapshot2,
        signature: "INVALID_SIGNATURE",
      },
    },
  });
});

test("SECSYNC_ERROR_112 invalid parentSnapshot verification on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const { snapshot } = createSnapshotTestHelper();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
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
        loadDocumentParams: {
          knownSnapshotInfo: {
            parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
            snapshotId: snapshot.publicData.snapshotId,
            snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
            updateClocks: {},
            additionalPublicData: undefined,
          },
          mode: "complete",
        },
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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("failed")
    ) {
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_112"
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    // parentSnapshotCiphertext: snapshot.ciphertext,
    parentSnapshotCiphertextHash: "WRONG_CIPHERTEXT_HASH",
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
  });

  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_112 fetch a snapshot, reconnect and receive a snapshot that is not a child of the first one", (done) => {
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

test("SECSYNC_ERROR_112 receive a snapshot that is not a child of the first one should result in a Websocket reconnect", (done) => {
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

  let connectingRetryCounter = 0;

  syncService.onTransition((state, event) => {
    if (state.matches("connecting.retrying")) {
      connectingRetryCounter++;
    }

    if (
      state.matches("connected.idle") &&
      state.context._snapshotAndUpdateErrors.length === 1
    ) {
      expect(state.context);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_112"
      );
      expect(connectingRetryCounter).toBe(2);
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
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        type: "snapshot",
        snapshot: createSnapshotTestHelper().snapshot,
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_113 invalid docId on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_113"
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper({ docId: "WRONG_DOC_ID" });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });
});

test("SECSYNC_ERROR_113 invalid docId on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_113"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
    docId: "WRONG_DOC_ID",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_114 isValidClient returns false on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => false,
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
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_114"
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper({ docId: "WRONG_DOC_ID" });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
    },
  });
});

test("SECSYNC_ERROR_114 isValidClient returns false on snapshot event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          return signingPublicKey === clientAPublicKey;
        },
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
      state.context._snapshotAndUpdateErrors.length === 1 &&
      state.matches("connected.idle")
    ) {
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_114"
      );
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
    signingKeyPair: clientBKeyPair,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });
});

test("SECSYNC_ERROR_115 reconnect receive a messed up chain", (done) => {
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
    if (state.value === "failed") {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors[0].message).toEqual(
        "SECSYNC_ERROR_115"
      );
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
            parentSnapshotProof: "WRONG_PROOF", // wrong proof
            snapshotCiphertextHash: hash(snapshot3.ciphertext, sodium),
          },
        ],
        snapshot: snapshot3,
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_201 should fail decryption on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_201"
      );
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
        createUpdateTestHelper({
          key: sodium.from_hex(
            "994b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
          ),
        }).update,
      ],
    },
  });
});

test("SECSYNC_ERROR_201 should fail decryption on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.matches("failed")) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_201"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper({
          key: sodium.from_hex(
            "994b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
          ),
        }).update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_202 should fail because the update clock increase by more than one on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello Worldu");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_202"
      );
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
        createUpdateTestHelper().update,
        createUpdateTestHelper({ version: 2 }).update,
      ],
    },
  });
});

test("SECSYNC_ERROR_202 should fail because the update clock increase by more than one on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.matches("failed")) {
      expect(docValue).toEqual("Hello Worldu");
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_202"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper({ version: 2 }).update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_203 applyChanges throws an error on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          throw new Error("CAN NOT APPLY CHANGES");
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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_203"
      );
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
        createUpdateTestHelper().update,
        createUpdateTestHelper({ version: 1 }).update,
      ],
    },
  });
});

test("SECSYNC_ERROR_203 applyChanges throws an error on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          return changes;
        },
        applyChanges: (changes) => {
          throw new Error("CAN NOT APPLY CHANGES");
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
    if (state.matches("failed")) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_203"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper({ version: 1 }).update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_204 deserializeChanges throws an error on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          throw new Error("CAN NOT DESERIALIZE CHANGES");
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
    if (
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_204"
      );
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
      updates: [createUpdateTestHelper().update],
    },
  });
});

test("SECSYNC_ERROR_204 deserializeChanges throws an error on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => key,
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        deserializeChanges: (changes) => {
          throw new Error("CAN NOT DESERIALIZE CHANGES");
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
    if (state.matches("failed")) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_204"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_205 isValidClient throws an errors on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let isValidClientCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (isValidClientCounter === 0) {
            isValidClientCounter++;
            return true;
          } else {
            throw new Error("CAN NOT VALIDATE CLIENT");
          }
        },
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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_205"
      );
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
      updates: [createUpdateTestHelper().update],
    },
  });
});

test("SECSYNC_ERROR_205 isValidClient throws an errors on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let isValidClientCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (isValidClientCounter === 0) {
            isValidClientCounter++;
            return true;
          } else {
            throw new Error("CAN NOT VALIDATE CLIENT");
          }
        },
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
    if (state.matches("failed")) {
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_205"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_206 getSnapshotKey throws an error on initial load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let getSnapshotKeyCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => {
          if (getSnapshotKeyCounter === 0) {
            getSnapshotKeyCounter++;
            return key;
          } else {
            throw new Error("CAN NOT GET SNAPSHOT KEY");
          }
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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_206"
      );
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
      updates: [createUpdateTestHelper().update],
    },
  });
});

test("SECSYNC_ERROR_206 getSnapshotKey throws an error on update event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let getSnapshotKeyCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          sodium.to_base64(clientAKeyPair.publicKey) === signingPublicKey,
        getSnapshotKey: () => {
          if (getSnapshotKeyCounter === 0) {
            getSnapshotKeyCounter++;
            return key;
          } else {
            throw new Error("CAN NOT GET SNAPSHOT KEY");
          }
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
    if (state.matches("failed")) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._documentDecryptionState).toBe("complete");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_206"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_211 failed to parse the error message on initial document load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_211"
      );
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
      updates: [{ ...createUpdateTestHelper().update, nonce: undefined }],
    },
  });
});

test("SECSYNC_ERROR_211 ignore update to parse the error message as incoming update", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.context._snapshotAndUpdateErrors.length === 1) {
      expect(docValue).toEqual("Hello World");
      expect(state.matches("failed")).toEqual(false);
      expect(state.context._documentDecryptionState).toEqual("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_211"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        nonce: undefined,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_212 invalid signature on initial document load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_212"
      );
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  const { snapshot } = createSnapshotTestHelper();
  const update = createUpdateTestHelper().update;
  const update2 = createUpdateTestHelper().update;

  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "document",
      snapshot,
      updates: [
        {
          ...update,
          signature: update2.signature,
        },
      ],
    },
  });
});

test("SECSYNC_ERROR_212 ignore update due invalid signature as incoming update", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.context._snapshotAndUpdateErrors.length === 1) {
      expect(docValue).toEqual("Hello World");
      expect(state.matches("failed")).toEqual(false);
      expect(state.context._documentDecryptionState).toEqual("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_212"
      );
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

  const { update: anotherUpdate } = createUpdateTestHelper();
  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        signature: anotherUpdate.signature,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_213 should fail due update referencing another snapshotId on inital document load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_213"
      );
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
        createUpdateTestHelper({ snapshotId: "OTHER_SNAPSHOT_ID" }).update,
      ],
    },
  });
});

test("SECSYNC_ERROR_213 should ignore the update due update referencing another snapshotId as incoming update", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.context._snapshotAndUpdateErrors.length === 1) {
      expect(docValue).toEqual("Hello World");
      expect(state.matches("failed")).toEqual(false);
      expect(state.context._documentDecryptionState).toEqual("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_213"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper({ snapshotId: "OTHER_SNAPSHOT_ID" }).update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_214 should fail because an update with same clock was received on initial document load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello Worldu");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_214"
      );
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
        createUpdateTestHelper().update,
        createUpdateTestHelper().update,
      ],
    },
  });
});

test("SECSYNC_ERROR_214 should ignore the received update because it had the same clock", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.context._snapshotAndUpdateErrors.length === 1) {
      expect(docValue).toEqual("Hello Worldu");
      expect(state.matches("failed")).toEqual(false);
      expect(state.context._documentDecryptionState).toEqual("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_214"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_215 isValidClient returns false on initial document load", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let isValidClientCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (isValidClientCounter === 0) {
            isValidClientCounter++;
            return true;
          } else {
            return false;
          }
        },
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
      state.matches("failed") &&
      state.context._documentDecryptionState === "partial"
    ) {
      expect(docValue).toEqual("Hello World");
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_215"
      );
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
      updates: [createUpdateTestHelper().update],
    },
  });
});

test("SECSYNC_ERROR_215 isValidClient returns false on a received event", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
    if (state.context._snapshotAndUpdateErrors.length === 1) {
      expect(docValue).toEqual("Hello Worldu");
      expect(state.matches("failed")).toEqual(false);
      expect(state.context._documentDecryptionState).toEqual("complete");
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_214"
      );
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

  setTimeout(() => {
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
    syncService.send({
      type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
      data: {
        ...createUpdateTestHelper().update,
        type: "update",
      },
    });
  }, 1);
});

test("SECSYNC_ERROR_301 ephemeral message decryption failed", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_301"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
    messageType: "proof",
    receiverSessionId,
    key: sodium.from_hex(
      "994b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
    ),
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      type: "ephemeral-message",
    },
  });
});

test("SECSYNC_ERROR_302 no verified session found", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_302"
      );
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

  const receiverSessionId = "WRONG_SESSION_ID";

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
    messageType: "message",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      type: "ephemeral-message",
    },
  });
});

test("SECSYNC_ERROR_303 ignore an ephemeral message coming from a reply attack", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      // the message with 22 from the reply attack is ignored
      expect(ephemeralMessagesValue[1]).toEqual(55);
      expect(state.context._ephemeralMessageReceivingErrors.length).toEqual(1);
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_303"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
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

test("SECSYNC_ERROR_304 isValidClient throws", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  let isValidClientCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (isValidClientCounter === 1) {
            throw new Error("BREAK");
          }
          isValidClientCounter++;
          return true;
        },
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_304"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
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
});

test("SECSYNC_ERROR_304 isValidClient returns false", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  let isValidClientCounter = 0;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => {
          if (isValidClientCounter === 1) {
            return false;
          }
          isValidClientCounter++;
          return true;
        },
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_304"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
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
});

test("SECSYNC_ERROR_305 invalid messageType", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_305"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
    messageType: "invalid",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      type: "ephemeral-message",
    },
  });
});

test("SECSYNC_ERROR_306 process three additional ephemeral messages where the second is ignored since the docId has been manipulated", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
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

test("SECSYNC_ERROR_307 invalid messageType", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_307"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
    messageType: "proof",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      publicData: {
        pubKey: ephemeralMessage.publicData.docId,
      },
      type: "ephemeral-message",
    },
  });
});

test("SECSYNC_ERROR_308 invalid signature", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) => true,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      state.matches("connected.idle") &&
      state.context._ephemeralMessageReceivingErrors.length === 1
    ) {
      expect(state.context._ephemeralMessageReceivingErrors[0].message).toEqual(
        "SECSYNC_ERROR_308"
      );
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
    syncService.getSnapshot().context._ephemeralMessagesSession.id;

  const { ephemeralMessage } = createEphemeralMessageTestHelper({
    messageType: "proof",
    receiverSessionId,
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessage,
      signature: "WRONG_SIGNATURE",
      type: "ephemeral-message",
    },
  });
});

test("SECSYNC_ERROR_401 fails to send a snapshot results in state: failed", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;
  let snapshotKeyCounter = 0;

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
        getSnapshotKey: () => {
          return key;
        },
        getNewSnapshotData: async ({ id }) => {
          throw new Error("BREAK getNewSnapshotData");
          // return {
          //   data: "New Snapshot Data",
          //   id: generateId(sodium),
          //   key,
          //   publicData: {},
          // };
        },
        applySnapshot: (snapshot) => {
          docValue = sodium.to_string(snapshot);
        },
        shouldSendSnapshot: () => true,
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
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (state.matches("failed")) {
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_401"
      );

      done();
    }
  });

  syncService.start();
});

test("SECSYNC_ERROR_501 fails to send an update results in state: failed", (done) => {
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive((event: any) => {});

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;
  let snapshotKeyCounter = 0;

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
        getSnapshotKey: () => {
          if (snapshotKeyCounter < 1) {
            snapshotKeyCounter++;
            return key;
          } else {
            throw new Error("BREAK getSnapshotKey");
          }
        },
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
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (state.matches("failed")) {
      expect(state.context._updatesInFlight).toStrictEqual([]);
      expect(state.context._snapshotAndUpdateErrors.length).toBe(1);
      expect(state.context._snapshotAndUpdateErrors[0].message).toBe(
        "SECSYNC_ERROR_501"
      );

      done();
    }
  });

  syncService.start();
});

test("SECSYNC_ERROR_601 fails to send ephemeralMessage", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock =
    (context: SyncMachineConfig) => (send: any, onReceive: any) => {
      onReceive(async (event: any) => {
        if (event.type === "SEND_EPHEMERAL_MESSAGE") {
          try {
            await event.getKey();
          } catch (error) {
            send({
              type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
              error: new Error("SECSYNC_ERROR_601"),
            });
          }
        }
      });

      send({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    };

  let docValue = "";
  let transitionCount = 0;
  let snapshotKeyCounter = 0;

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
        getSnapshotKey: () => {
          if (snapshotKeyCounter < 1) {
            snapshotKeyCounter++;
            return key;
          } else {
            throw new Error("THROW ON SNAPSHOT KEY");
          }
        },
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
        type: "ADD_EPHEMERAL_MESSAGE",
        data: "Hello World",
      });
    }, 1);
  };

  syncService.onTransition((state, event) => {
    transitionCount = transitionCount + 1;
    if (event.type === "WEBSOCKET_CONNECTED") {
      runEvents();
    }

    if (transitionCount === 7) {
      setTimeout(done, 0);
      expect(state.context._ephemeralMessageAuthoringErrors.length).toBe(1);
      expect(state.context._ephemeralMessageAuthoringErrors[0].message).toBe(
        "SECSYNC_ERROR_601"
      );
    }
  });

  syncService.start();
});

test("should ignore an update in case it's a reply attack with the same update", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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

test("set _documentDecryptionState to failed if not even the snapshot can be loaded", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          clientAPublicKey === signingPublicKey,
        getSnapshotKey: () => {
          throw new Error("INVALID");
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

test("set _documentDecryptionState to partial and apply the first update, if document snapshot decrypts but the second update fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          clientAPublicKey === signingPublicKey,
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
        createUpdateTestHelper().update,
        createUpdateTestHelper({ version: 1000 }).update,
      ],
    },
  });
});

test("set _documentDecryptionState to partial, if document snapshot decrypts but the first update fails", (done) => {
  const websocketServiceMock = (context: any) => () => {};

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
          clientAPublicKey === signingPublicKey,
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
      updates: [createUpdateTestHelper({ version: 1000 }).update],
    },
  });
});

test("store not more than 20 receiving failed ephemeral message errors", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      expect(state.context._ephemeralMessageReceivingErrors.length).toEqual(20);
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
    // @ts-expect-error _ephemeralMessagesSession is defined once the machine is initiate
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

  for (let step = 0; step < 25; step++) {
    const { ephemeralMessage: ephemeralMessageX } =
      createEphemeralMessageTestHelper({
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

  const { ephemeralMessage: ephemeralMessageLast } =
    createEphemeralMessageTestHelper({
      messageType: "message",
      receiverSessionId,
    });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...ephemeralMessageLast,
      type: "ephemeral-message",
    },
  });
});

test("reset the context entries after websocket disconnect", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

  const { snapshot } = createSnapshotTestHelper();

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      expect(state.context._incomingQueue).toEqual([]);
      expect(state.context._customMessageQueue).toEqual([]);
      expect(state.context._snapshotInFlight).toEqual(null);
      expect(state.context._updatesInFlight).toEqual([]);
      expect(state.context._snapshotInfosWithUpdateClocks).toEqual([]);
      expect(state.context._updatesLocalClock).toEqual(-1);
      expect(state.context._ephemeralMessagesSession).not.toBe(null);
      expect(state.context._ephemeralMessageReceivingErrors).toEqual([]);
      expect(state.context._ephemeralMessageAuthoringErrors).toEqual([]);
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

  syncService.send({
    type: "DISCONNECT",
  });
});

test("reconnect and reload the document", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();
  let reconnected = false;

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine
      .withContext({
        ...syncMachine.context,
        documentId: docId,
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidClient: (signingPublicKey) =>
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
      createUpdateTestHelper().update,
      createUpdateTestHelper({ version: 1 }).update,
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

test("store not more than 20 failed creating ephemeral message errors", (done) => {
  const websocketServiceMock = (context: any) => () => {};

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();
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
          clientAPublicKey === signingPublicKey,
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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
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
    if (transitionCount === 27 && state.matches("connected.idle")) {
      expect(state.context._ephemeralMessageAuthoringErrors.length).toEqual(20);
      expect(state.context._ephemeralMessageAuthoringErrors[0].message).toEqual(
        "SECSYNC_ERROR_601"
      );
      expect(
        state.context._ephemeralMessageAuthoringErrors[19].message
      ).toEqual("SECSYNC_ERROR_601");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });

  for (let step = 0; step < 25; step++) {
    syncService.send({
      type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
      error: new Error("SECSYNC_ERROR_601"),
    });
  }
});
