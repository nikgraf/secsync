import sodium, { KeyPair } from "libsodium-wrappers";
import { createActor, fromCallback } from "xstate";
import { createSyncMachine } from "./createSyncMachine";
import { generateId } from "./crypto/generateId";
import { defaultTestMachineInput } from "./mocks";
import { createSnapshot } from "./snapshot/createSnapshot";
import { SnapshotPublicData } from "./types";
import { WebsocketActorParams } from "./utils/websocketService";

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

test("send ephemeralMessage", (done) => {
  const onReceiveCallback = jest.fn();
  const websocketServiceMock = fromCallback(
    ({ sendBack, receive, input }: WebsocketActorParams) => {
      receive(onReceiveCallback);

      sendBack({ type: "WEBSOCKET_CONNECTED" });

      return () => {};
    }
  );

  let docValue = "";
  let transitionCount = 0;

  const syncMachine = createSyncMachine();
  const syncService = createActor(
    syncMachine.provide({
      actors: { websocketActor: websocketServiceMock },
    }),
    {
      input: {
        ...defaultTestMachineInput,
        documentId: docId,
        websocketEndpoint: url,
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
      },
    }
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

  syncService.subscribe(() => {
    transitionCount = transitionCount + 1;

    if (transitionCount === 3) {
      runEvents();
    }

    if (transitionCount === 7) {
      expect(onReceiveCallback).toHaveBeenCalledTimes(1);
      expect(onReceiveCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: "Hello World",
          messageType: "message",
          type: "SEND_EPHEMERAL_MESSAGE",
        })
      );
      setTimeout(done, 0);
    }
  });

  syncService.start();
});
