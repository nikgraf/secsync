import sodium, { KeyPair } from "libsodium-wrappers";
import { assign, interpret, spawn } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { createSnapshot } from "./snapshot/createSnapshot";
import { SnapshotPublicData, SyncMachineConfig } from "./types";

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

it("should retry if snapshot-", (done) => {
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
        websocketHost: url,
        websocketSessionKey: "sessionKey",
        isValidCollaborator: (signingPublicKey) =>
          sodium.to_base64(signatureKeyPair.publicKey) === signingPublicKey,
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
