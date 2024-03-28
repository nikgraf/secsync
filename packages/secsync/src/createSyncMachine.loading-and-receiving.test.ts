import sodium, { KeyPair } from "libsodium-wrappers";
import { createActor, fromCallback } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { createEphemeralMessage } from "./ephemeralMessage/createEphemeralMessage";
import { createEphemeralMessageProof } from "./ephemeralMessage/createEphemeralSessionProof";
import { defaultTestMachineInput } from "./mocks";
import { createSnapshot } from "./snapshot/createSnapshot";
import {
  EphemeralMessagePublicData,
  SnapshotPublicData,
  SnapshotUpdateClocks,
  UpdatePublicData,
} from "./types";
import { createUpdate } from "./update/createUpdate";
import { WebsocketActorParams } from "./utils/websocketService";

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
    content,
    parentSnapshotUpdateClocks,
  } = params || {};
  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  const publicData: SnapshotPublicData = {
    snapshotId,
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
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
};

const createUpdateTestHelper = (params?: CreateUpdateTestHelperParams) => {
  const version = params?.version || 0;
  const publicData: UpdatePublicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
  };

  const update = createUpdate(
    "u",
    publicData,
    key,
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

test("should connect to the websocket", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

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
        signatureKeyPair: clientAKeyPair,
        sodium,
      },
    }
  );

  syncService.subscribe((state) => {
    if (state.matches("connected")) {
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });
});

test("should initially have _documentDecryptionState state", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      },
    }
  );

  syncService.subscribe((state) => {
    if (state.matches({ connected: "idle" })) {
      expect(state.context._documentDecryptionState).toEqual("pending");
      expect(docValue).toEqual("");
      done();
    }
  });

  syncService.start();
  syncService.send({ type: "WEBSOCKET_RETRY" });
  syncService.send({ type: "WEBSOCKET_CONNECTED" });
});

test("should load a document", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      },
    }
  );

  syncService.subscribe((state) => {
    if (
      state.matches({ connected: "idle" }) &&
      state.context._documentDecryptionState === "complete"
    ) {
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
    },
  });
});

test("should load a document with updates", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
      },
    }
  );

  syncService.subscribe((state) => {
    if (
      state.matches({ connected: "idle" }) &&
      state.context._documentDecryptionState === "complete"
    ) {
      expect(docValue).toEqual("Hello Worlduu");
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

test("should load a document and two additional updates", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
      },
    }
  );

  syncService.subscribe((state) => {
    if (docValue === "Hello Worlduu") {
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

  const { update: update2 } = createUpdateTestHelper({ version: 1 });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update2,
      type: "update",
    },
  });
});

test("should load a document and an additional snapshot", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
      },
    }
  );

  syncService.subscribe((state) => {
    if (docValue === "Hello World again") {
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

test("should load a document with updates and two additional updates", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
      },
    }
  );

  syncService.subscribe((state) => {
    if (docValue === "Hello Worlduuuu") {
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

  const { update } = createUpdateTestHelper({ version: 2 });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update,
      type: "update",
    },
  });

  const { update: update2 } = createUpdateTestHelper({ version: 3 });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      ...update2,
      type: "update",
    },
  });
});

test("should load a document with updates and two additional snapshots", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";

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
      },
    }
  );

  syncService.subscribe((state) => {
    if (docValue === "Hello World again and again") {
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

  const { snapshot: snapshot2 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
    grandParentSnapshotProof: snapshot.publicData.parentSnapshotProof,
    content: "Hello World again",
    parentSnapshotUpdateClocks: {
      [sodium.to_base64(clientAKeyPair.publicKey)]: 1,
    },
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot2,
    },
  });

  const { snapshot: snapshot3 } = createSnapshotTestHelper({
    parentSnapshotId: snapshot2.publicData.snapshotId,
    parentSnapshotCiphertextHash: hash(snapshot2.ciphertext, sodium),
    grandParentSnapshotProof: snapshot2.publicData.parentSnapshotProof,
    content: "Hello World again and again",
  });
  syncService.send({
    type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE",
    data: {
      type: "snapshot",
      snapshot: snapshot3,
    },
  });
});

test("should load a document and process three additional ephemeral messages", (done) => {
  const websocketServiceMock = fromCallback(({}: WebsocketActorParams) => {});

  let docValue = "";
  let ephemeralMessagesValue = new Uint8Array();

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
        applyEphemeralMessage: (ephemeralMessage) => {
          ephemeralMessagesValue = new Uint8Array([
            ...ephemeralMessagesValue,
            ephemeralMessage,
          ]);
        },
        sodium: sodium,
        signatureKeyPair: clientAKeyPair,
      },
    }
  );

  syncService.subscribe((state) => {
    if (ephemeralMessagesValue.length === 2) {
      expect(ephemeralMessagesValue[0]).toEqual(22);
      expect(ephemeralMessagesValue[1]).toEqual(22);
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
      const { ephemeralMessage: ephemeralMessage3 } =
        createEphemeralMessageTestHelper({
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
