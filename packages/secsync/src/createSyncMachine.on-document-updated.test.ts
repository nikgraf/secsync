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
  SnapshotInfoWithUpdateClocks,
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
  parentSnapshotCiphertext: string;
  grandParentSnapshotProof: string;
  content: string;
  parentSnapshotUpdateClocks?: SnapshotUpdateClocks;
};

const createSnapshotTestHelper = (params?: CreateSnapshotTestHelperParams) => {
  snapshotId = generateId(sodium);
  const {
    parentSnapshotId,
    parentSnapshotCiphertext,
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

test("should invoke onDocumentUpdated twice on document load", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let shouldSendSnapshot = false;
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
        shouldSendSnapshot: () => shouldSendSnapshot,
        onDocumentUpdated,
      },
    }
  );

  syncService.subscribe((state) => {
    if (
      state.matches({ connected: "idle" }) &&
      state.context._documentDecryptionState === "complete"
    ) {
      expect(docValue).toEqual("Hello Worlduu");
      expect(onDocumentUpdated).toHaveBeenCalledTimes(2);
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(1, {
        type: "snapshot-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {},
        },
      });
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(2, {
        type: "update-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {
            "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 1,
          },
        },
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
      updates: [
        createUpdateTestHelper().update,
        createUpdateTestHelper({ version: 1 }).update,
      ],
    },
  });
});

test("should invoke onDocumentUpdated for confirmed update", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let shouldSendSnapshot = false;
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
        shouldSendSnapshot: () => shouldSendSnapshot,
        onDocumentUpdated,
      },
    }
  );

  syncService.subscribe((state) => {
    if (
      state.matches({ connected: "idle" }) &&
      state.context._snapshotInfosWithUpdateClocks.length === 1 &&
      state.context._snapshotInfosWithUpdateClocks[0].updateClocks[
        clientAPublicKey
      ] === 2
    ) {
      expect(docValue).toEqual("Hello Worlduu");
      expect(onDocumentUpdated).toHaveBeenCalledTimes(3);
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(1, {
        type: "snapshot-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {},
        },
      });
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(2, {
        type: "update-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {
            "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 1,
          },
        },
      });
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(3, {
        type: "update-saved",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {
            "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 2,
          },
        },
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
          type: "update-saved",
          snapshotId: snapshot.publicData.snapshotId,
          clock: 2,
        },
      });
    }, 1);
  }, 1);
});

test("should invoke onDocumentUpdated for confirmed snapshot", (done) => {
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
      expect(docValue).toEqual("Hello Worlduu");
      expect(onDocumentUpdated).toHaveBeenCalledTimes(3);
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(1, {
        type: "snapshot-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {},
        },
      });
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(2, {
        type: "update-received",
        knownSnapshotInfo: {
          snapshotId: snapshot.publicData.snapshotId,
          snapshotCiphertextHash: hash(snapshot.ciphertext, sodium),
          parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
          updateClocks: {
            "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM": 1,
          },
        },
      });
      expect(onDocumentUpdated).toHaveBeenNthCalledWith(3, {
        type: "snapshot-saved",
        knownSnapshotInfo: {
          snapshotId: snapshotInFlight.snapshotId,
          snapshotCiphertextHash: snapshotInFlight.snapshotCiphertextHash,
          parentSnapshotProof: snapshotInFlight.parentSnapshotProof,
          updateClocks: {},
        },
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
