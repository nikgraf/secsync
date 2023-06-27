import type { KeyPair } from "libsodium-wrappers";
import {
  AnyActorRef,
  assign,
  createMachine,
  forwardTo,
  sendTo,
  spawn,
} from "xstate";
import { hash } from "./crypto/hash";
import { parseEphemeralUpdateWithServerData } from "./ephemeralUpdate/parseEphemeralUpdateWithServerData";
import { verifyAndDecryptEphemeralUpdate } from "./ephemeralUpdate/verifyAndDecryptEphemeralUpdate";
import { SecsyncProcessingEphemeralUpdateError } from "./errors";
import { createInitialSnapshot } from "./snapshot/createInitialSnapshot";
import { createSnapshot } from "./snapshot/createSnapshot";
import { isValidAncestorSnapshot } from "./snapshot/isValidAncestorSnapshot";
import { parseSnapshotWithServerData } from "./snapshot/parseSnapshotWithServerData";
import { verifyAndDecryptSnapshot } from "./snapshot/verifyAndDecryptSnapshot";
import {
  ParentSnapshotProofInfo,
  SnapshotPublicData,
  SnapshotWithServerData,
  SyncMachineConfig,
  UpdateWithServerData,
} from "./types";
import { createUpdate } from "./update/createUpdate";
import { parseUpdatesWithServerData } from "./update/parseUpdatesWithServerData";
import { verifyAndDecryptUpdate } from "./update/verifyAndDecryptUpdate";
import { websocketService } from "./utils/websocketService";

// The sync machine is responsible for syncing the document with the server.
// Specifically it is responsible for:
// - sending snapshots
// - sending updates
// - sending ephemeral updates
// - receiving snapshots
// - receiving updates
// - receiving ephemeral updates
//
// In general the first thing that happens is that a websocket connection is established.
// Once that's done the latest snapshot including it's related updates should be received.
//
// In order to process incoming and outgoing changes the sync machine uses three queues:
// - _incomingQueue: contains all incoming messages from the server
// - _customMessageQueue: contains all custom incoming messages from the server
// - _pendingChangesQueue: contains all outgoing messages that are not yet sent to the server
//
// How Queue processing works
// -------------------------
// 1. first handle all incoming custom messages
// 2. first handle all incoming message
// 3. then handle all pending updates
// Background: There might be a new snapshot and this way we avoid retries
//
// Websockets reconnection logic:
// During the state connecting the sync machine will try to reconnect to the server.
// If no connection can be established after 5 seconds it will trigger a retry after a delay.
// The delay is based on the number of retries that have already been done using an exponential
// formula: (100 * 1.8 ** websocketRetries).
// The websocketRetries is capped at 13 so that the delay doesn't get too large.
//
// Handling outgoing messages
// -------------------------
// Once a change is added and the `_pendingChangesQueue` is processed it will collect all changes
// and depending on `shouldSendSnapshot` either send a snapshot or an update.
// In case a snapshot is sent `_pendingChangesQueue` is cleared and the `_activeSendingSnapshotInfo` set to the snapshot ID.
// In case an update is sent the changes will be added to the `_updatesInFlight` and the `_sendingUpdatesClock` increased by one.
//
// If a snapshot saved event is received
// - the `_activeSnapshotInfo` is set to the snapshot (id, parentSnapshotProof, ciphertextHash)
// - the `_activeSendingSnapshotInfo` is cleared.
// Queue processing for sending messages is resumed.
//
// If an update saved event is received
// - the `_latestServerVersion` is set to the update version
// - the `_confirmedUpdatesClock`
// - the update removed from the `_updatesInFlight` removed
//
// IF a snapshot failed to save
// - the snapshot and changes that came with the response are applied and another snapshot is created and sent
//
// If an update failed to save
// - check if the update is in the `_updatesInFlight` - only if it's there a retry is necessary
// since we know it was not handled by a new snapshot or update
// - set the `_sendingUpdatesClock` to the `_confirmedUpdatesClock`
// - all the changes from this failed and later updates plus the new pendingChanges are taken and a new update is created and
// sent with the clock set to the latest confirmed clock + 1
//
// When loading the initial document it's important to make sure these variables are correctly set:
// - `_confirmedUpdatesClock`
// - `_sendingUpdatesClock` (same as `_confirmedUpdatesClock`)
// - `_latestServerVersion`
// - `_activeSnapshotInfo`
// Otherwise you might try to send an update that the server will reject.

type UpdateInFlight = {
  clock: number;
  changes: any[];
};

type UpdateClocks = {
  [snapshotId: string]: { [publicSigningKey: string]: number };
};

type MostRecentEphemeralUpdateDatePerPublicSigningKey = {
  [publicSigningKey: string]: Date;
};

type ActiveSnapshotInfo = {
  id: string;
  ciphertext: string;
  parentSnapshotProof: string;
};

export type DocumentDecryptionState =
  | "pending"
  | "failed"
  | "partial"
  | "complete";

type ProcessQueueData = {
  handledQueue: "customMessage" | "incoming" | "pending" | "none";
  activeSnapshotInfo: ActiveSnapshotInfo | null;
  latestServerVersion: number | null;
  activeSendingSnapshotInfo: ActiveSnapshotInfo | null;
  sendingUpdatesClock: number;
  confirmedUpdatesClock: number;
  updatesInFlight: UpdateInFlight[];
  pendingChangesQueue: any[];
  updateClocks: UpdateClocks;
  mostRecentEphemeralUpdateDatePerPublicSigningKey: MostRecentEphemeralUpdateDatePerPublicSigningKey;
  ephemeralUpdateErrors: SecsyncProcessingEphemeralUpdateError[];
  documentDecryptionState: DocumentDecryptionState;
};

export type InternalContextReset = {
  _latestServerVersion: null | number;
  _activeSnapshotInfo: null | ActiveSnapshotInfo;
  _incomingQueue: any[];
  _customMessageQueue: any[];
  _activeSendingSnapshotInfo: ActiveSnapshotInfo | null;
  _updatesInFlight: UpdateInFlight[];
  _confirmedUpdatesClock: number | null;
  _sendingUpdatesClock: number;
  _updateClocks: UpdateClocks;
  _mostRecentEphemeralUpdateDatePerPublicSigningKey: MostRecentEphemeralUpdateDatePerPublicSigningKey;
  _documentDecryptionState: DocumentDecryptionState;
};

export type Context = SyncMachineConfig &
  InternalContextReset & {
    _websocketRetries: number;
    _websocketActor?: AnyActorRef;
    _pendingChangesQueue: any[];
    _shouldReconnect: boolean;
    _errorTrace: Error[];
    _ephemeralUpdateErrors: Error[];
  };

const disconnectionContextReset: InternalContextReset = {
  _activeSnapshotInfo: null,
  _latestServerVersion: null,
  _incomingQueue: [],
  _customMessageQueue: [],
  _activeSendingSnapshotInfo: null,
  _updatesInFlight: [],
  _confirmedUpdatesClock: null,
  _sendingUpdatesClock: -1,
  _updateClocks: {},
  _mostRecentEphemeralUpdateDatePerPublicSigningKey: {},
  _documentDecryptionState: "pending",
};

export const createSyncMachine = () =>
  /** @xstate-layout N4IgpgJg5mDOIC5SwJ4DsDGBZAhhgFgJZpgDEAygKIByAIgNoAMAuoqAA4D2shALoZzRsQAD0QBGcQE4A7ADpxMgKwA2JQBYlAJnEAOTeoA0IFIgC0i9XPU29M9Vq0rdMlSoC+746ky4CxMgBBWloAfUoABQAJSixKACVAgBlQgFUI2kCAFUomViQQLh5+QWExBEkleUZHGRd1XS1GRhljUwqGqQV9RgBmFXVewd1erU9vdGw8IhJSAHVKACFyAHkAYQBpSizQ2gBJcjWV6mpKNZyGFmEivgEhAvKqtsRR3WslPS0pVQcNdRlxiAfFN-LN9odjqdznlrtxbqUHogniZEFoZPIpCpHEpGFIWiopNJAcC-DMwHIMIISBh+GgoPMlqtNttQkcTmcLjCCjcSvdQOVxGolAoZH1enoaupxFojCiEP0rDYqippSpGDj1cTJqSAhSqWAacR6cEwmsooFqABxXJXblw3llCTON6DKTi77K3oaZ4VDRyfpY3S6bTiAO9KRa3zTXWUtDU2lQOQAdxwtzpDOW6y2O3i23iAE0uRx7XdHRVQ1o5KKpK63MHxP8fb19N1gzX-uoVKMqpGQWS9XGDbxIBmmdndutUnFqDtqCsdgAxFapOhFwolhH8iR44XiHHfNX2Qk+6XNOSMRpfLTBztKJS9nUkAfxkcLTPMnYrwKpLJRFbxPYAC1KEufJi2KUtEQqQld33VQWnUY85VDKRK1dLQPi0XpensNEH2jJ9YxfCA5EICAABsyDfMcWRNUIshWUI9moI4sGYy1QgARVSSgeLXHlIK3BAmkYOQ1CDJQgywlx+l6E91RUKshgwtQvkkXp8NBckiKHSBSIoqjGSzWiQnoxi1lScgGKwUI4nIchAmtLieL421wPhPlRFRM9xODKTmxkWSTz3SsRmVDD1D6O8AS8IFtQI7T9RpPSyMo0g6LNC1rX4jdPPKESxMkvzGgCoLkJlN43RkJxgw+JQpBcTT+x05KSPYAAnTgMDgHg6U4gBXMBBtgUgIEEcliAAN04ABrckOq6nqBqGuAcogzcvIqFpRN0N1xBaPEamUJRgpkcRz2+f4QrUbCmpjJLhzazrutgXqoGW4bSDAdrOvauR2HInBeAAM04dqAFt-uepbBuGtaPLLaQ9wUODD0Q8QTww0Sqj0LsMPq-o7sIh69IWl63o+uBR2MnY6IYpiWJWNirWc3ibTA9d1ryxAVHsORGg0XQu1FXRJGC5s5Hq+x0RcZocXUInEsHVqocW16jUpkbqJp0I6fMyzrNsyh7McyhWdcjmBI28oBlE9E1XVHCVUkk7kMYBxrG+Q7xV6PpO0V59dKetWKdhqmMvNK12dhLmy0C3prFVZxMQaaRWjlGtFPDQZangvR71ikkEsDlWCANGajQXMGsDBsBKb2Ydwa1oyP110z6eY1j2PN6O7VjqCGz5i93QbJRmykGtgvquQZU0SSsSlIWNML+KtJLx6KXwcvK+r2v68b5v33HPXWQNpmjZNpzuLZ+GHQHmxRLFaqGzca8pHkrsFAcBr9t5xRNRXlGNeLUN5lwwBXOkVd2o13anXMODcwBN3SqZTKUdb6CU2nuUYYlRSaH2rIJojgfSYmqFKGwTQhi6EYHuAOIC9JgIgVAKBMC4ErQQUgkQsBeBA3JDgYGw52oAApGAAEpSBF2ASTEiDCd7QL3vAg+6DrYSGlGhKSahFA4XqpjAYChvjVXdriO8QtaFSM3tvSBu9YH70QSNTh3DhxyD4QI4RYiJHNTMTIyxcjrEKNsfQcQltcqIyaOdaSOhsI1moT6Ro8g9w1DloKRC14A4QEILAOhEBkGmkjtlNynMEZQQcAnaqeIsKYjRG2FQ8lKw1gqW4BJuJdCpPSZk0gSjuYIHqopL4UUZRemvHUJsvsqzu0GDYQKrhRieFimgTgEA4DCHcQEGOhShLVOQsKTs4Z8YVSGBPcQpjlYJlWXfISUyFAO1cH0SQ0hXbtCcHbC8ygArYlQgXCYQCPHHKNHIWBvB2ooCNKcjBAohg9LxA2C80hgzuybA0PRSpELIqGH0I58ZfkpjTFAEFyiECi3OoKZo1zxSSG+E2FUeiZQ1lcFUKoYxAF9nuscyAuLOnejlASSsvMsKIWqrLNQ6Kg76UomyxGNRTqiSvOibC6omj6CFSrMmPUNZh3gH3NZm1nDyEaNQqh7suySUxuGMSDUGrNlFl8W6jLHxK2IuY8BsiWE2KbmKge2hRK81iUGXEDgMblTVP6TsoYVSWslC0jJUi3VCSGOdGQP86iDJ+OSuUV53jomoQappAc5mBAwOTaNm1sRZ1qAMbQl45LIS9FYfo15BhnSGPGjwNri7A1TJRCAhb8oqX9KWzQ15HCVvaNKBFQZ1KClFovZenggA */
  createMachine(
    {
      schema: {
        events: {} as
          | { type: "WEBSOCKET_CONNECTED" }
          | { type: "WEBSOCKET_DISCONNECTED" }
          | { type: "WEBSOCKET_DOCUMENT_NOT_FOUND" }
          | { type: "WEBSOCKET_UNAUTHORIZED" }
          | { type: "WEBSOCKET_DOCUMENT_ERROR" }
          | { type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE"; data: any }
          | { type: "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE"; data: any }
          | { type: "WEBSOCKET_RETRY" }
          | { type: "DISCONNECT" }
          | { type: "CONNECT" }
          | { type: "ADD_CHANGES"; data: any[] }
          | { type: "ADD_EPHEMERAL_UPDATE"; data: any }
          | {
              type: "SEND_EPHEMERAL_UPDATE";
              data: any;
              getEphemeralUpdateKey: () => Promise<Uint8Array>;
            }
          | { type: "SEND"; message: any },
        context: {} as Context,
        services: {} as {
          processQueues: { data: ProcessQueueData };
        },
      },
      tsTypes: {} as import("./createSyncMachine.typegen").Typegen0,
      predictableActionArguments: true,
      // context: JSON.parse(JSON.stringify(initialContext)),
      context: {
        documentId: "",
        signatureKeyPair: {} as KeyPair,
        websocketHost: "",
        websocketSessionKey: "",
        applySnapshot: () => undefined,
        getSnapshotKey: () => Promise.resolve(new Uint8Array()),
        applyChanges: () => undefined,
        getNewSnapshotData: () =>
          Promise.resolve({
            id: "",
            data: "",
            key: new Uint8Array(),
            publicData: {},
          }),
        getUpdateKey: () => Promise.resolve(new Uint8Array()),
        applyEphemeralUpdates: () => undefined,
        getEphemeralUpdateKey: () => Promise.resolve(new Uint8Array()),
        shouldSendSnapshot: () => false,
        sodium: {},
        serializeChanges: () => "",
        deserializeChanges: () => [],
        onSnapshotSaved: () => undefined,
        isValidCollaborator: async () => false,
        additionalAuthenticationDataValidations: undefined,
        _activeSnapshotInfo: null,
        _latestServerVersion: null,
        _incomingQueue: [],
        _customMessageQueue: [],
        _pendingChangesQueue: [],
        _activeSendingSnapshotInfo: null,
        _shouldReconnect: false,
        _websocketRetries: 0,
        _updatesInFlight: [],
        _confirmedUpdatesClock: null,
        _sendingUpdatesClock: -1,
        _updateClocks: {},
        _mostRecentEphemeralUpdateDatePerPublicSigningKey: {},
        _errorTrace: [],
        _ephemeralUpdateErrors: [],
        _documentDecryptionState: "pending",
      },
      initial: "connecting",
      on: {
        SEND: {
          actions: forwardTo("websocketActor"),
        },
        ADD_EPHEMERAL_UPDATE: {
          actions: sendTo("websocketActor", (context, event) => {
            return {
              type: "SEND_EPHEMERAL_UPDATE",
              data: event.data,
              getEphemeralUpdateKey: context.getEphemeralUpdateKey,
            };
          }),
        },
        WEBSOCKET_DISCONNECTED: { target: "disconnected" },
        DISCONNECT: { target: "disconnected" },
      },
      states: {
        connecting: {
          initial: "waiting",
          states: {
            retrying: {
              entry: ["increaseWebsocketRetry", "spawnWebsocketActor"],
            },
            waiting: {
              invoke: {
                id: "scheduleRetry",
                src: "scheduleRetry",
              },
              on: {
                WEBSOCKET_RETRY: {
                  target: "retrying",
                },
              },
            },
          },
          on: {
            WEBSOCKET_CONNECTED: {
              target: "connected",
            },
            ADD_CHANGES: {
              actions: ["addToPendingUpdatesQueue"],
            },
          },
        },
        connected: {
          entry: ["resetWebsocketRetries"],
          states: {
            idle: {
              on: {
                WEBSOCKET_ADD_TO_INCOMING_QUEUE: {
                  actions: ["addToIncomingQueue"],
                  target: "processingQueues",
                },
                WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE: {
                  actions: ["addToCustomMessageQueue"],
                  target: "processingQueues",
                },
                ADD_CHANGES: {
                  actions: ["addToPendingUpdatesQueue"],
                  target: "processingQueues",
                },
              },
            },
            processingQueues: {
              on: {
                WEBSOCKET_ADD_TO_INCOMING_QUEUE: {
                  actions: ["addToIncomingQueue"],
                },
                WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE: {
                  actions: ["addToCustomMessageQueue"],
                },
                ADD_CHANGES: {
                  actions: ["addToPendingUpdatesQueue"],
                },
              },
              invoke: {
                id: "processQueues",
                src: "processQueues",
                onDone: {
                  actions: ["removeOldestItemFromQueueAndUpdateContext"],
                  target: "checkingForMoreQueueItems",
                },
                onError: {
                  actions: ["storeErrorInErrorTrace"],
                  target: "#syncMachine.failed",
                },
              },
            },

            checkingForMoreQueueItems: {
              on: {
                WEBSOCKET_ADD_TO_INCOMING_QUEUE: {
                  actions: ["addToIncomingQueue"],
                },
                WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE: {
                  actions: ["addToCustomMessageQueue"],
                },
                ADD_CHANGES: {
                  actions: ["addToPendingUpdatesQueue"],
                },
              },
              after: {
                // move to the next tick so that the queue is no causing an endless loop of processing
                0: [
                  {
                    target: "processingQueues",
                    cond: "hasMoreItemsInQueues",
                  },
                  { target: "idle" },
                ],
              },
            },
          },
          on: {
            WEBSOCKET_DOCUMENT_NOT_FOUND: { target: "noAccess" },
            WEBSOCKET_UNAUTHORIZED: { target: "noAccess" },
            WEBSOCKET_DOCUMENT_ERROR: { target: "failed" },
          },

          initial: "idle",
        },

        disconnected: {
          entry: ["resetContext", "stopWebsocketActor"],
          always: {
            target: "connecting",
            cond: "shouldReconnect",
          },
          on: {
            ADD_CHANGES: {
              actions: ["addToPendingUpdatesQueue"],
            },
            CONNECT: {
              target: "connecting",
            },
          },
        },
        noAccess: {
          entry: ["stopWebsocketActor"],
        },
        failed: {
          entry: ["stopWebsocketActor"],
        },
      },
      id: "syncMachine",
    },
    {
      actions: {
        resetWebsocketRetries: assign({
          _websocketRetries: 0,
        }),
        increaseWebsocketRetry: assign((context) => {
          // limit it to 13 to prevent too long apart retries
          if (context._websocketRetries < 13) {
            return { _websocketRetries: context._websocketRetries + 1 };
          }
          return { _websocketRetries: context._websocketRetries };
        }),
        spawnWebsocketActor: assign((context) => {
          return {
            _websocketActor: spawn(websocketService(context), "websocketActor"),
          };
        }),
        stopWebsocketActor: assign((context) => {
          if (context._websocketActor?.stop) {
            context._websocketActor?.stop();
          }
          return {
            _websocketActor: undefined,
          };
        }),
        resetContext: assign((context, event) => {
          return {
            // reset the context and make sure there are no stale references
            // using JSON.parse(JSON.stringify()) to make sure we have a clean copy
            ...JSON.parse(JSON.stringify(disconnectionContextReset)),
            _shouldReconnect: event.type !== "DISCONNECT",
          };
        }),
        addToIncomingQueue: assign((context, event) => {
          return {
            _incomingQueue: [...context._incomingQueue, event.data],
          };
        }),
        addToCustomMessageQueue: assign((context, event) => {
          return {
            _customMessageQueue: [...context._customMessageQueue, event.data],
          };
        }),
        addToPendingUpdatesQueue: assign((context, event) => {
          console.debug("addToPendingUpdatesQueue", event.data);
          return {
            _pendingChangesQueue: [
              ...context._pendingChangesQueue,
              ...event.data,
            ],
          };
        }),
        removeOldestItemFromQueueAndUpdateContext: assign((context, event) => {
          if (event.data.handledQueue === "incoming") {
            return {
              _incomingQueue: context._incomingQueue.slice(1),
              _pendingChangesQueue: event.data.pendingChangesQueue,
              _activeSnapshotInfo: event.data.activeSnapshotInfo,
              _latestServerVersion: event.data.latestServerVersion,
              _activeSendingSnapshotInfo: event.data.activeSendingSnapshotInfo,
              _sendingUpdatesClock: event.data.sendingUpdatesClock,
              _confirmedUpdatesClock: event.data.confirmedUpdatesClock,
              _updatesInFlight: event.data.updatesInFlight,
              _updateClocks: event.data.updateClocks,
              _mostRecentEphemeralUpdateDatePerPublicSigningKey:
                event.data.mostRecentEphemeralUpdateDatePerPublicSigningKey,
              _ephemeralUpdateErrors: event.data.ephemeralUpdateErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
            };
          } else if (event.data.handledQueue === "customMessage") {
            return {
              _customMessageQueue: context._customMessageQueue.slice(1),
              _pendingChangesQueue: event.data.pendingChangesQueue,
              _activeSnapshotInfo: event.data.activeSnapshotInfo,
              _latestServerVersion: event.data.latestServerVersion,
              _activeSendingSnapshotInfo: event.data.activeSendingSnapshotInfo,
              _sendingUpdatesClock: event.data.sendingUpdatesClock,
              _confirmedUpdatesClock: event.data.confirmedUpdatesClock,
              _updatesInFlight: event.data.updatesInFlight,
              _updateClocks: event.data.updateClocks,
              _mostRecentEphemeralUpdateDatePerPublicSigningKey:
                event.data.mostRecentEphemeralUpdateDatePerPublicSigningKey,
              _ephemeralUpdateErrors: event.data.ephemeralUpdateErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
            };
          } else {
            return {
              _pendingChangesQueue: event.data.pendingChangesQueue,
              _activeSnapshotInfo: event.data.activeSnapshotInfo,
              _latestServerVersion: event.data.latestServerVersion,
              _activeSendingSnapshotInfo: event.data.activeSendingSnapshotInfo,
              _sendingUpdatesClock: event.data.sendingUpdatesClock,
              _confirmedUpdatesClock: event.data.confirmedUpdatesClock,
              _updatesInFlight: event.data.updatesInFlight,
              _updateClocks: event.data.updateClocks,
              _mostRecentEphemeralUpdateDatePerPublicSigningKey:
                event.data.mostRecentEphemeralUpdateDatePerPublicSigningKey,
              _ephemeralUpdateErrors: event.data.ephemeralUpdateErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
            };
          }
        }),
        // @ts-expect-error can't type the onError differently than onDone
        storeErrorInErrorTrace: assign((context, event) => {
          return {
            _documentDecryptionState:
              // @ts-expect-error documentDecryptionState is dynamically added to the error event
              event.data?.documentDecryptionState ||
              context._documentDecryptionState,
            _errorTrace: [event.data, ...context._errorTrace],
          };
        }),
      },
      services: {
        scheduleRetry: (context) => (callback) => {
          const delay = 100 * 1.8 ** context._websocketRetries;
          console.debug("schedule websocket connection in ", delay);
          setTimeout(() => {
            callback("WEBSOCKET_RETRY");
            // calculating slow exponential back-off
          }, delay);
        },
        processQueues: (context, event) => async (send) => {
          console.debug("clocks", JSON.stringify(context._updateClocks));
          console.debug("processQueues event", event);
          console.debug("_incomingQueue", context._incomingQueue.length);
          console.debug(
            "_customMessageQueue",
            context._customMessageQueue.length
          );
          console.debug(
            "_pendingChangesQueue",
            context._pendingChangesQueue.length
          );

          let activeSnapshotInfo: ActiveSnapshotInfo | null =
            context._activeSnapshotInfo;
          let latestServerVersion = context._latestServerVersion;
          let handledQueue: "customMessage" | "incoming" | "pending" | "none" =
            "none";
          let activeSendingSnapshotInfo = context._activeSendingSnapshotInfo;
          let sendingUpdatesClock = context._sendingUpdatesClock;
          let confirmedUpdatesClock = context._confirmedUpdatesClock;
          let updatesInFlight = context._updatesInFlight;
          let pendingChangesQueue = context._pendingChangesQueue;
          let updateClocks = context._updateClocks;
          let mostRecentEphemeralUpdateDatePerPublicSigningKey =
            context._mostRecentEphemeralUpdateDatePerPublicSigningKey;
          let documentDecryptionState = context._documentDecryptionState;

          try {
            const createAndSendSnapshot = async () => {
              const snapshotData = await context.getNewSnapshotData();
              console.log("createAndSendSnapshot", snapshotData);

              if (activeSnapshotInfo === null) {
                const publicData: SnapshotPublicData = {
                  ...snapshotData.publicData,
                  snapshotId: snapshotData.id,
                  docId: context.documentId,
                  pubKey: context.sodium.to_base64(
                    context.signatureKeyPair.publicKey
                  ),
                  parentSnapshotClocks: {},
                };
                const snapshot = createInitialSnapshot(
                  snapshotData.data,
                  publicData,
                  snapshotData.key,
                  context.signatureKeyPair,
                  context.sodium
                );

                activeSendingSnapshotInfo = {
                  id: snapshot.publicData.snapshotId,
                  ciphertext: snapshot.ciphertext,
                  parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
                };
                pendingChangesQueue = [];

                send({
                  type: "SEND",
                  message: JSON.stringify({
                    ...snapshot,
                    // Note: send a faulty message to test the error handling
                    // ciphertext: "lala",
                    lastKnownSnapshotId: null,
                    latestServerVersion,
                    additionalServerData: snapshotData.additionalServerData,
                  }),
                });
              } else {
                const publicData: SnapshotPublicData = {
                  ...snapshotData.publicData,
                  snapshotId: snapshotData.id,
                  docId: context.documentId,
                  pubKey: context.sodium.to_base64(
                    context.signatureKeyPair.publicKey
                  ),
                  parentSnapshotClocks:
                    updateClocks[activeSnapshotInfo.id] || {},
                };
                const snapshot = createSnapshot(
                  snapshotData.data,
                  publicData,
                  snapshotData.key,
                  context.signatureKeyPair,
                  activeSnapshotInfo.ciphertext,
                  activeSnapshotInfo.parentSnapshotProof,
                  context.sodium
                );

                activeSendingSnapshotInfo = {
                  id: snapshot.publicData.snapshotId,
                  ciphertext: snapshot.ciphertext,
                  parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
                };
                pendingChangesQueue = [];

                send({
                  type: "SEND",
                  message: JSON.stringify({
                    ...snapshot,
                    // Note: send a faulty message to test the error handling
                    // ciphertext: "lala",
                    lastKnownSnapshotId: activeSnapshotInfo.id,
                    latestServerVersion,
                    additionalServerData: snapshotData.additionalServerData,
                  }),
                });
              }
            };

            const createAndSendUpdate = (
              changes: unknown[],
              key: Uint8Array,
              refSnapshotId: string,
              clock: number
            ) => {
              // console.log("createAndSendUpdate", key);
              const update = context.serializeChanges(changes);
              sendingUpdatesClock = clock + 1;

              const publicData = {
                refSnapshotId,
                docId: context.documentId,
                pubKey: context.sodium.to_base64(
                  context.signatureKeyPair.publicKey
                ),
              };
              const message = createUpdate(
                update,
                publicData,
                key,
                context.signatureKeyPair,
                sendingUpdatesClock,
                context.sodium
              );

              updatesInFlight.push({
                clock: sendingUpdatesClock,
                changes,
              });
              send({
                type: "SEND",
                message: JSON.stringify(message),
                // Note: send a faulty message to test the error handling
                // message: JSON.stringify({ ...message, ciphertext: "lala" }),
              });
            };

            const processSnapshot = async (
              rawSnapshot: SnapshotWithServerData,
              parentSnapshotProofInfo?: ParentSnapshotProofInfo
            ) => {
              console.debug("processSnapshot", rawSnapshot);
              const snapshot = parseSnapshotWithServerData(
                rawSnapshot,
                context.additionalAuthenticationDataValidations?.snapshot
              );

              const isValidCollaborator = await context.isValidCollaborator(
                snapshot.publicData.pubKey
              );
              if (!isValidCollaborator) {
                throw new Error("Invalid collaborator");
              }

              let parentSnapshotUpdateClock: number | undefined = undefined;

              if (
                parentSnapshotProofInfo &&
                updateClocks[parentSnapshotProofInfo.id]
              ) {
                const currentClientPublicKey = context.sodium.to_base64(
                  context.signatureKeyPair.publicKey
                );
                parentSnapshotUpdateClock =
                  updateClocks[parentSnapshotProofInfo.id][
                    currentClientPublicKey
                  ];
              }

              const snapshotKey = await context.getSnapshotKey(snapshot);
              // console.log("processSnapshot key", snapshotKey);
              const decryptedSnapshot = verifyAndDecryptSnapshot(
                snapshot,
                snapshotKey,
                context.sodium.from_base64(snapshot.publicData.pubKey),
                context.signatureKeyPair.publicKey,
                context.sodium,
                parentSnapshotProofInfo,
                parentSnapshotUpdateClock
              );

              // TODO reset the clocks for the snapshot for the signing key
              context.applySnapshot(decryptedSnapshot);
              activeSnapshotInfo = {
                id: snapshot.publicData.snapshotId,
                ciphertext: snapshot.ciphertext,
                parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
              };
              latestServerVersion = snapshot.serverData.latestVersion;
              confirmedUpdatesClock = null;
              sendingUpdatesClock = -1;
            };

            const processUpdates = async (
              rawUpdates: UpdateWithServerData[]
            ) => {
              const updates = parseUpdatesWithServerData(
                rawUpdates,
                context.additionalAuthenticationDataValidations?.update
              );
              let changes: unknown[] = [];

              try {
                for (let update of updates) {
                  const key = await context.getUpdateKey(update);
                  // console.log("processUpdates key", key);
                  if (activeSnapshotInfo === null) {
                    throw new Error("No active snapshot");
                  }

                  const isValidCollaborator = await context.isValidCollaborator(
                    update.publicData.pubKey
                  );
                  if (!isValidCollaborator) {
                    throw new Error("Invalid collaborator");
                  }

                  const currentClock =
                    updateClocks[activeSnapshotInfo.id] &&
                    Number.isInteger(
                      updateClocks[activeSnapshotInfo.id][
                        update.publicData.pubKey
                      ]
                    )
                      ? updateClocks[activeSnapshotInfo.id][
                          update.publicData.pubKey
                        ]
                      : -1;

                  const { content, clock } = verifyAndDecryptUpdate(
                    update,
                    key,
                    context.sodium.from_base64(update.publicData.pubKey),
                    currentClock,
                    context.sodium
                  );

                  const existingClocks =
                    updateClocks[activeSnapshotInfo.id] || {};
                  updateClocks[activeSnapshotInfo.id] = {
                    ...existingClocks,
                    [update.publicData.pubKey]: clock,
                  };

                  latestServerVersion = update.serverData.version;
                  if (
                    update.publicData.pubKey ===
                    context.sodium.to_base64(context.signatureKeyPair.publicKey)
                  ) {
                    confirmedUpdatesClock = update.publicData.clock;
                    sendingUpdatesClock = update.publicData.clock;
                  }

                  const additionalChanges = context.deserializeChanges(
                    context.sodium.to_string(content)
                  );
                  changes = changes.concat(additionalChanges);
                }
                context.applyChanges(changes);
              } catch (error) {
                console.debug("APPLYING CHANGES in catch", error);
                // still try to apply all existing changes
                context.applyChanges(changes);
                throw error;
              }
            };

            if (context._customMessageQueue.length > 0) {
              handledQueue = "customMessage";
              const event = context._customMessageQueue[0];
              if (context.onCustomMessage) {
                await context.onCustomMessage(event);
              }
            } else if (context._incomingQueue.length > 0) {
              handledQueue = "incoming";
              const event = context._incomingQueue[0];
              switch (event.type) {
                case "document":
                  documentDecryptionState = "failed";
                  if (context.knownSnapshotInfo) {
                    const isValid = isValidAncestorSnapshot({
                      knownSnapshotProofEntry: {
                        parentSnapshotProof:
                          context.knownSnapshotInfo.parentSnapshotProof,
                        snapshotCiphertextHash:
                          context.knownSnapshotInfo.snapshotCiphertextHash,
                      },
                      snapshotProofChain: event.snapshotProofChain,
                      currentSnapshot: event.snapshot,
                      sodium: context.sodium,
                    });
                    if (!isValid) {
                      throw new Error("Invalid ancestor snapshot");
                    }
                  }

                  if (
                    !event.snapshot &&
                    event.updates &&
                    event.updates.length > 0
                  ) {
                    throw new Error("Document has no snapshot but has updates");
                  }
                  if (event.snapshot) {
                    activeSnapshotInfo = {
                      id: event.snapshot.publicData.snapshotId,
                      ciphertext: event.snapshot.ciphertext,
                      parentSnapshotProof:
                        event.snapshot.publicData.parentSnapshotProof,
                    };

                    await processSnapshot(event.snapshot);
                    documentDecryptionState = "partial";

                    if (event.updates) {
                      await processUpdates(event.updates);
                    }
                  }
                  documentDecryptionState = "complete";

                  break;

                case "snapshot":
                  console.log("snapshot", event);
                  await processSnapshot(
                    event.snapshot,
                    activeSnapshotInfo ? activeSnapshotInfo : undefined
                  );

                  break;

                case "snapshot-saved":
                  console.log("snapshot saved", event);
                  // in case the event is received for a snapshot that was not active in sending
                  // we remove the activeSendingSnapshotInfo since any activeSendingSnapshotInfo
                  // that is in flight will fail
                  if (event.snapshotId !== activeSendingSnapshotInfo?.id) {
                    throw new Error(
                      "Received snapshot-saved for other than the current activeSendingSnapshotInfo"
                    );
                  }
                  activeSnapshotInfo = activeSendingSnapshotInfo;
                  activeSendingSnapshotInfo = null;
                  latestServerVersion = null;
                  sendingUpdatesClock = -1;
                  confirmedUpdatesClock = null;
                  if (context.onSnapshotSaved) {
                    context.onSnapshotSaved();
                  }
                  break;
                case "snapshot-save-failed": // TODO rename to snapshotSaveFailed or similar
                  console.log("snapshot saving failed", event);
                  if (event.snapshot) {
                    const snapshot = parseSnapshotWithServerData(
                      event.snapshot,
                      context.additionalAuthenticationDataValidations?.snapshot
                    );

                    if (activeSnapshotInfo) {
                      const isValid = isValidAncestorSnapshot({
                        knownSnapshotProofEntry: {
                          parentSnapshotProof:
                            activeSnapshotInfo.parentSnapshotProof,
                          snapshotCiphertextHash: hash(
                            activeSnapshotInfo.ciphertext,
                            context.sodium
                          ),
                        },
                        snapshotProofChain: event.snapshotProofChain,
                        currentSnapshot: snapshot,
                        sodium: context.sodium,
                      });
                      if (!isValid) {
                        throw new Error(
                          "Invalid ancestor snapshot after snapshot-save-failed event"
                        );
                      }
                    }

                    await processSnapshot(snapshot);
                  }
                  // TODO test-case:
                  // snapshot is sending, but haven’t received confirmation for the updates I already sent
                  // currently this breaks (assumption due the incoming and outgoing clock being the same)
                  if (event.updates) {
                    await processUpdates(event.updates);
                  }

                  console.log("retry send snapshot");
                  await createAndSendSnapshot();
                  break;

                case "update":
                  await processUpdates([event]);
                  break;
                case "update-saved":
                  console.debug("update saved", event);
                  latestServerVersion = event.serverVersion;
                  confirmedUpdatesClock = event.clock;
                  updatesInFlight = updatesInFlight.filter(
                    (updateInFlight) => updateInFlight.clock !== event.clock
                  );

                  break;
                case "update-save-failed":
                  console.log(
                    "update saving failed",
                    event.snapshotId,
                    event.clock,
                    event.requiresNewSnapshot
                  );

                  if (event.requiresNewSnapshot) {
                    await createAndSendSnapshot();
                  } else {
                    const updateIndex = updatesInFlight.findIndex(
                      (updateInFlight) => updateInFlight.clock === event.clock
                    );
                    if (updateIndex !== -1) {
                      updatesInFlight.slice(updateIndex);

                      const changes = updatesInFlight.reduce(
                        (acc, updateInFlight) =>
                          acc.concat(updateInFlight.changes),
                        [] as unknown[]
                      );

                      changes.push(...context._pendingChangesQueue);
                      pendingChangesQueue = [];

                      const key = await context.getUpdateKey(event);

                      if (activeSnapshotInfo === null) {
                        throw new Error("No active snapshot");
                      }
                      sendingUpdatesClock = confirmedUpdatesClock ?? -1;
                      updatesInFlight = [];
                      createAndSendUpdate(
                        changes,
                        key,
                        activeSnapshotInfo.id,
                        sendingUpdatesClock
                      );
                    }
                  }

                  break;
                case "ephemeral-update":
                  try {
                    const ephemeralUpdate = parseEphemeralUpdateWithServerData(
                      event,
                      context.additionalAuthenticationDataValidations
                        ?.ephemeralUpdate
                    );

                    const ephemeralUpdateKey =
                      await context.getEphemeralUpdateKey();

                    const isValidCollaborator =
                      await context.isValidCollaborator(
                        ephemeralUpdate.publicData.pubKey
                      );
                    if (!isValidCollaborator) {
                      throw new Error("Invalid collaborator");
                    }

                    const ephemeralUpdateResult =
                      verifyAndDecryptEphemeralUpdate(
                        ephemeralUpdate,
                        ephemeralUpdateKey,
                        context.sodium.from_base64(
                          ephemeralUpdate.publicData.pubKey
                        ),
                        context.sodium,
                        mostRecentEphemeralUpdateDatePerPublicSigningKey[
                          ephemeralUpdate.publicData.pubKey
                        ]
                      );
                    mostRecentEphemeralUpdateDatePerPublicSigningKey[
                      event.publicData.pubKey
                    ] = ephemeralUpdateResult.date;

                    context.applyEphemeralUpdates([
                      ephemeralUpdateResult.content,
                    ]);
                  } catch (err) {
                    throw new SecsyncProcessingEphemeralUpdateError(
                      "Failed to process ephemeral update",
                      err
                    );
                  }
                  break;
              }
            } else if (
              context._pendingChangesQueue.length > 0 &&
              activeSendingSnapshotInfo === null
            ) {
              handledQueue = "pending";

              if (
                activeSnapshotInfo === null ||
                context.shouldSendSnapshot({
                  activeSnapshotId: activeSnapshotInfo?.id || null,
                  latestServerVersion,
                })
              ) {
                console.debug("send snapshot");
                await createAndSendSnapshot();
              } else {
                console.debug("send update");
                const key = await context.getUpdateKey(event);
                const rawChanges = context._pendingChangesQueue;
                pendingChangesQueue = [];
                if (activeSnapshotInfo === null) {
                  throw new Error("No active snapshot");
                }
                createAndSendUpdate(
                  rawChanges,
                  key,
                  activeSnapshotInfo.id,
                  sendingUpdatesClock
                );
              }
            }

            return {
              handledQueue,
              activeSnapshotInfo,
              latestServerVersion,
              activeSendingSnapshotInfo,
              confirmedUpdatesClock,
              sendingUpdatesClock,
              updatesInFlight,
              pendingChangesQueue,
              updateClocks,
              mostRecentEphemeralUpdateDatePerPublicSigningKey,
              ephemeralUpdateErrors: context._ephemeralUpdateErrors,
              documentDecryptionState,
            };
          } catch (error) {
            console.error("Processing queue error:", error);
            if (error instanceof SecsyncProcessingEphemeralUpdateError) {
              const newEphemeralUpdateErrors = [
                ...context._ephemeralUpdateErrors,
              ];
              newEphemeralUpdateErrors.unshift(error);
              return {
                handledQueue,
                activeSnapshotInfo,
                latestServerVersion,
                activeSendingSnapshotInfo,
                confirmedUpdatesClock,
                sendingUpdatesClock,
                updatesInFlight,
                pendingChangesQueue,
                updateClocks,
                mostRecentEphemeralUpdateDatePerPublicSigningKey,
                ephemeralUpdateErrors: newEphemeralUpdateErrors.slice(0, 20), // avoid a memory leak by storing max 20 errors
                documentDecryptionState,
              };
            } else {
              // @ts-ignore fails on some environments and not in others
              error.documentDecryptionState = documentDecryptionState;
              throw error;
            }
          }
        },
      },
      guards: {
        hasMoreItemsInQueues: (context) => {
          return (
            context._customMessageQueue.length > 0 ||
            context._incomingQueue.length > 0 ||
            context._pendingChangesQueue.length > 0
          );
        },
        shouldReconnect: (context, event) => {
          return context._shouldReconnect;
        },
      },
    }
  );
