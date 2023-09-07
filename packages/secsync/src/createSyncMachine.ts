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
import { messageTypes } from "./ephemeralMessage/createEphemeralMessage";
import { createEphemeralSession } from "./ephemeralMessage/createEphemeralSession";
import { parseEphemeralMessageWithServerData } from "./ephemeralMessage/parseEphemeralMessageWithServerData";
import { verifyAndDecryptEphemeralMessage } from "./ephemeralMessage/verifyAndDecryptEphemeralMessage";
import { SecsyncProcessingEphemeralMessageError } from "./errors";
import { createInitialSnapshot } from "./snapshot/createInitialSnapshot";
import { createSnapshot } from "./snapshot/createSnapshot";
import { isValidAncestorSnapshot } from "./snapshot/isValidAncestorSnapshot";
import { parseSnapshotWithServerData } from "./snapshot/parseSnapshotWithServerData";
import { verifyAndDecryptSnapshot } from "./snapshot/verifyAndDecryptSnapshot";
import {
  EphemeralMessagesSession,
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
// - sending ephemeral messages
// - receiving snapshots
// - receiving updates
// - receiving ephemeral messages
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
// - the snapshot and changes that came with the response are applied and another snapshot is created and sent. If there is a new snapshot and it has been received in the meantime
// the snapshot is ignored. If there are new updates and they already have been applied they
// are ignored as well.
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
  receivingEphemeralMessageErrors: SecsyncProcessingEphemeralMessageError[];
  documentDecryptionState: DocumentDecryptionState;
  ephemeralMessagesSession: EphemeralMessagesSession | null;
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
  _documentDecryptionState: DocumentDecryptionState;
  _ephemeralMessagesSession: EphemeralMessagesSession | null;
};

export type Context = SyncMachineConfig &
  InternalContextReset & {
    _websocketRetries: number;
    _websocketActor?: AnyActorRef;
    _pendingChangesQueue: any[];
    _shouldReconnect: boolean;
    _errorTrace: Error[];
    _receivingEphemeralMessageErrors: Error[];
    _creatingEphemeralMessageErrors: Error[];
    logging: SyncMachineConfig["logging"];
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
  _documentDecryptionState: "pending",
  _ephemeralMessagesSession: null,
};

export const createSyncMachine = () =>
  /** @xstate-layout N4IgpgJg5mDOIC5SwJ4DsDGBZAhhgFgJZpgDEAygKIByAIgNoAMAuoqAA4D2shALoZzRsQAD0QBGcQE4A7ADpxMgKwA2JQBYlAJnEAOTeoA0IFIgC0i9XPU29M9Vq0rdMlSoC+746ky4CxMgBBWloAfUoABQAJSixKACVAgBlQgFUI2kCAFUomViQQLh5+QWExBEkleUZHGRd1XS1GRhljUwqGqQV9RgBmFXVewd1erU9vdGw8IhJSAHVKACFyAHkAYQBpSizQ2gBJcjWV6mpKNZyGFmEivgEhAvKqtsRR3WslPS0pVQcNdRlxiAfFN-LN9odjqdznlrtxbqUHogniZEFoZPIpCpHEpGFIWiopNJAcC-DMyAAxQJ7JKUMJreKUbJ7agAcXC0ViCWSaQy2VyVwKNxK91A7TMjnEckxvSUMt6jF0IxkUmM5ScVQU4iqvVGdUcvWJk1JATkGEEJAw-DQUHmS1Wm22oSOJzOFxhgrhwrKEjUSgUMj6vT0NXU4i0RhRCH6VhsVRUYZUjBxScNvmmJrNaAtVptwTpUUCrMo5HdHE9d29FXRjClg1cKnlunEQdakYsjWs6N0Sik6lkLT6qZBZNN5rAluIUDkAHccLdrbblustjsGVl4gBNUuFcsI0DlSSjOQB3u9THOD7-Z5R-Tdbu9-7qBtaKpD40kUdZ8e8SCL+0r3Z1lSOJqB2agVh2ckVlSOhtyFCtEQQJomjkM8RikF8pBGf4lGvcRGD7VCMMcKRejqXEXzfdMP0zbNfwWJcHR2GDAlSLIohWeI9gALVpODdxFUQJEJP0tVxVQWj7cQ8LPLRrFkj4tB1ew0So0EwE-OiID-ZdHVoICQJ2BJ4k4-jigQ-dURqSURiqfQDCqPo8IMKUtEVHUviUD4ajUkdaO-SA5EICAABsyAY-9HTzUIshWUJmSOLBmTZABFVJKHSsz4UEtVmjkNRFSURUlJcfpejwpMVGPIYXzUL5D18jMx0tQLgrCnSmNCaLYqdVJyFirBQjichyECFlKFCNKMv5fIy3MvchKQvKCu7YrelKhs8K1OTbNcF91D6LyAS8IEjWojT-JaiAgtCoIQidAsixLAU5uyys3L9FaPixOVvrwpxJUYeMagI5tdEJRqaOan9rvYAAnTgMDgHhrRSgBXMAMdgUgIEEDTiAAN04ABrDT4cR5H0cxuAsq9RD8I1BxvjPeNm2bFVI0PSU-gJGpXFlA0TpJc7NIC2GEaR2AUagKmsdIMA4YRuG5HYEKcF4AAzTg4YAWxViXKYxrHaYsxbpC1BQcW+RN7EJf6cTkKo9GfLzSI8IWzvU0Wrv1impcnWW4A6gDurihKViS1lJvSzKXp3eacsQFR7DkRoNF0BsAybaTObBx3ZH+OoAyTAjIYu6HAvJyXpcD7GIt0nZQ96-qI6G4tRvG6PppNhbygGGt0UTJMyPjIrcM5gi5L7HtmiDeUhndiY0y9y6Yd96uA6NoPorWR7xue2b47e+mwzktEsKTL4CKwlQZKU-KekYcQ1G+IrF9O5e-Ir66CHHYnJ3JNrLA2swCBz2D+HWdc7QNy6vdHq4dI6pRjjNWECdKziEfHIBUQZCSaHWlIXsW0exyHDJoN+4ZnaCyXsOJqX4fa-wwP-a0gC4bALhqAre4CwCQODlFOBcU1h9QGm3EaY0JpTVjofeCvcJA2BrIGGQOgnxYnBhVBsCgmZNiBjIRQKYPaf1oVpU0+A-4AKASAsBEDsY7z3sWHuicKg9isPhNE-xdCHXjK2doGDQz5VIsqcMQZkLqDLt7NeDCmFQBYWwjh1MuE8JELAXg6sNI4A1j+OGAAKRgABKUgwsV7f2MaY5h5j2GWO4bAex6DT7WGKmoRQZEez-QGAob4iiCLiTfqE1egUIlmNYRYzhVjSCJOST+OQaSMnZLyQUr+dDwkmMYQMmJFTIH0HEFIgS6CmiShKjoHUvYn7XkaPIMSTQkzPz7G5UJEBCCwF6dpGxhZ97VMQphEhT4S4HVGLiW+kY6hSmbOGAkkh8JniULc+5jzSDOihFkN5lkEAEisD2SQ-w+jKDUHhVpWd0SEhHm4TQUKHnf1IIixaPYqpXxlIE7QLhdDXh1APAigwbAyBHqMTwJ00CcAgHAYQcyAioOPki-5YonBdGlLKWUColRSB6dDScIq6ZItcL0BQQ9XB9DBd8a8TgWXdhaK4QYOINCKoWZOOQ7DeBwxQMqj0aD6YLxIXiDBCppBGojO0IYbxpCxj7IGoYg59E0Khpa60M45w5hVabco2dNXNG1UGSQerIz9ElNIcMvZ+bKEURarSsaZEIA0NeAkclk5KVDE-XsjgQmhvfOXBZrVbpFocS4raAZXVog5fKbQCp63UMbWEyuBt-aoy3vAR1orFrOHkI0J+7iCINiKv9M8fjwYjEVGGUiVCP5hqbUY-ppTBnlOGZUtt6D+35T1HUdxtac7eINahJ8zZ4xNmCSSx5l7EJDElMqJseoXA-DTe0L4U8qgBnwl8rCoTeWBAwNXH9SLHB5R1EGA6OI3HInaCMKquDMTon6ISHRoSNZzjChAZDi0KF+ixTKU5jQlJrq6ASTd60P2kUhdyoAA */
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
          | {
              type: "ADD_EPHEMERAL_UPDATE";
              data: any;
              messageType?: keyof typeof messageTypes;
            }
          | {
              type: "SEND_EPHEMERAL_UPDATE";
              data: any;
              messageType: keyof typeof messageTypes;
              getEphemeralMessageKey: () => Uint8Array | Promise<Uint8Array>;
            }
          | {
              type: "FAILED_CREATING_EPHEMERAL_UPDATE";
              error: any;
            }
          | { type: "SEND"; message: any },
        context: {} as Context,
        services: {} as {
          processQueues: { data: ProcessQueueData };
        },
      },
      tsTypes: {} as import("./createSyncMachine.typegen").Typegen0,
      predictableActionArguments: true,
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
        applyEphemeralMessages: () => undefined,
        getEphemeralMessageKey: () => Promise.resolve(new Uint8Array()),
        shouldSendSnapshot: () => false,
        sodium: {},
        serializeChanges: () => "",
        deserializeChanges: () => [],
        onSnapshotSaved: () => undefined,
        isValidCollaborator: async () => false,
        logging: "off",
        additionalAuthenticationDataValidations: undefined,
        _activeSnapshotInfo: null, // Why is it important?
        _latestServerVersion: null, // Why? - just remove it
        _incomingQueue: [], // TODO _queues.incoming
        _customMessageQueue: [], // TODO _queues.customMessages
        _pendingChangesQueue: [], // TODO _queues.pendingChanges
        _activeSendingSnapshotInfo: null,
        _shouldReconnect: false, // TODO move to _websocket and rename to shouldReconnect
        _websocketRetries: 0, // TODO move to _websocket and rename to retries
        _updatesInFlight: [], // Why? - if necessary move to _updates - updatesInFlight
        _confirmedUpdatesClock: null, // TODO move to _updates.currentClient and rename to serverConfirmedClock (why not part of _updateClocks?)
        _sendingUpdatesClock: -1, // TODO move to _updates.currentClient and rename to localClock
        _updateClocks: {},
        _errorTrace: [],
        _receivingEphemeralMessageErrors: [], // TODO move to _ephemeralMessages and rename to receivingErrors
        _creatingEphemeralMessageErrors: [], // TODO move to _ephemeralMessages and rename to creatingErrors
        _documentDecryptionState: "pending",
        _ephemeralMessagesSession: null, // TODO move to _ephemeralMessages and rename to _sessionInfo
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
              messageType: event.messageType || "message",
              getEphemeralMessageKey: context.getEphemeralMessageKey,
            };
          }),
        },
        WEBSOCKET_DISCONNECTED: { target: "disconnected" },
        DISCONNECT: { target: "disconnected" },
        FAILED_CREATING_EPHEMERAL_UPDATE: {
          actions: ["updateCreatingEphemeralMessageErrors"],
        },
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
          // the counter in there is only the initial counter and actually
          // increased with ever ephemeral message sent inside "websocketActor"
          const ephemeralMessagesSession = createEphemeralSession(
            context.sodium
          );
          return {
            _ephemeralMessagesSession: ephemeralMessagesSession,
            _websocketActor: spawn(
              websocketService(context, ephemeralMessagesSession),
              "websocketActor"
            ),
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
          if (context.logging === "debug") {
            console.debug("addToPendingUpdatesQueue", event.data);
          }
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
              _receivingEphemeralMessageErrors:
                event.data.receivingEphemeralMessageErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
              _ephemeralMessagesSession: event.data.ephemeralMessagesSession,
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
              _receivingEphemeralMessageErrors:
                event.data.receivingEphemeralMessageErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
              _ephemeralMessagesSession: event.data.ephemeralMessagesSession,
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
              _receivingEphemeralMessageErrors:
                event.data.receivingEphemeralMessageErrors,
              _documentDecryptionState: event.data.documentDecryptionState,
              _ephemeralMessagesSession: event.data.ephemeralMessagesSession,
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
        updateCreatingEphemeralMessageErrors: assign((context, event) => {
          return {
            _creatingEphemeralMessageErrors: [
              event.error,
              ...context._creatingEphemeralMessageErrors,
            ].slice(0, 20), // avoid a memory leak by storing max 20 errors
          };
        }),
      },
      services: {
        scheduleRetry: (context) => (callback) => {
          const delay = 100 * 1.8 ** context._websocketRetries;
          if (context.logging === "debug") {
            console.debug("schedule websocket connection in ", delay);
          }
          setTimeout(() => {
            callback("WEBSOCKET_RETRY");
            // calculating slow exponential back-off
          }, delay);
        },
        processQueues: (context, event) => async (send) => {
          if (context.logging === "debug") {
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
          }

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
          let documentDecryptionState = context._documentDecryptionState;
          let ephemeralMessagesSession = context._ephemeralMessagesSession;

          try {
            const createAndSendSnapshot = async () => {
              const snapshotData = await context.getNewSnapshotData();
              if (context.logging === "debug") {
                console.log("createAndSendSnapshot", snapshotData);
              }

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
              if (context.logging === "debug") {
                console.debug("processSnapshot", rawSnapshot);
              }
              try {
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
                  context.signatureKeyPair.publicKey,
                  context.sodium,
                  parentSnapshotProofInfo,
                  parentSnapshotUpdateClock
                );

                context.applySnapshot(decryptedSnapshot);
                activeSnapshotInfo = {
                  id: snapshot.publicData.snapshotId,
                  ciphertext: snapshot.ciphertext,
                  parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
                };
                latestServerVersion = snapshot.serverData.latestVersion;
                confirmedUpdatesClock = null;
                sendingUpdatesClock = -1;
                if (
                  parentSnapshotProofInfo &&
                  updateClocks[parentSnapshotProofInfo.id]
                ) {
                  // cleanup the updateClocks to avoid a memory leak
                  delete updateClocks[parentSnapshotProofInfo.id];
                }
              } catch (err) {
                if (
                  context.logging === "debug" ||
                  context.logging === "error"
                ) {
                  console.error("Process snapshot:", err);
                }
                throw err;
              }
            };

            const processUpdates = async (
              rawUpdates: UpdateWithServerData[],
              skipIfCurrentClockIsHigher: boolean,
              skipUpdatesAuthoredByCurrentClient: boolean
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

                  const decryptUpdateResult = verifyAndDecryptUpdate(
                    update,
                    key,
                    context.sodium.to_base64(
                      context.signatureKeyPair.publicKey
                    ),
                    currentClock,
                    skipIfCurrentClockIsHigher,
                    skipUpdatesAuthoredByCurrentClient,
                    context.sodium
                  );

                  if (decryptUpdateResult === null) {
                    continue;
                  }

                  const { content, clock } = decryptUpdateResult;

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
                if (context.logging === "debug") {
                  console.debug("APPLYING CHANGES in catch", error);
                }
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
                      // skipIfCurrentClockIsHigher to false since the document would
                      // be broken if the server sends update events with the same clock
                      // value multiple times
                      // skipUpdatesAuthoredByCurrentClient is set to false since the server
                      // should never send an update made by the current client in this case
                      await processUpdates(event.updates, false, false);
                    }
                  }
                  documentDecryptionState = "complete";

                  break;

                case "snapshot":
                  if (context.logging === "debug") {
                    console.log("snapshot", event);
                  }
                  await processSnapshot(
                    event.snapshot,
                    activeSnapshotInfo ? activeSnapshotInfo : undefined
                  );

                  break;

                case "snapshot-saved":
                  if (context.logging === "debug") {
                    console.log("snapshot saved", event);
                  }
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
                case "snapshot-save-failed":
                  if (context.logging === "debug") {
                    console.log("snapshot saving failed", event);
                  }
                  if (event.snapshot) {
                    const snapshot = parseSnapshotWithServerData(
                      event.snapshot,
                      context.additionalAuthenticationDataValidations?.snapshot
                    );

                    const isAlreadyProcessedSnapshot =
                      activeSnapshotInfo.id ===
                        snapshot.publicData.snapshotId &&
                      activeSnapshotInfo.ciphertext === snapshot.ciphertext &&
                      activeSnapshotInfo.parentSnapshotProof ===
                        snapshot.publicData.parentSnapshotProof;

                    if (!isAlreadyProcessedSnapshot) {
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
                  }

                  if (event.updates) {
                    // skipIfCurrentClockIsHigher to true since the update might already
                    // have been received via update message
                    // skipUpdatesAuthoredByCurrentClient is set to true since it can happen
                    // that an update was sent, saved on the server, but the confirmation
                    // `updated-saved` not yet received
                    await processUpdates(event.updates, true, true);
                  }

                  if (context.logging === "debug") {
                    console.log("retry send snapshot");
                  }
                  await createAndSendSnapshot();
                  break;

                case "update":
                  // skipIfCurrentClockIsHigher to true since the update might already
                  // have been received via snapshot-save-failed message
                  // skipUpdatesAuthoredByCurrentClient is set to false since the server
                  // should never send an update made by the current client in this case
                  await processUpdates([event], true, false);
                  break;
                case "update-saved":
                  if (context.logging === "debug") {
                    console.debug("update saved", event);
                  }
                  latestServerVersion = event.serverVersion;
                  confirmedUpdatesClock = event.clock;
                  updatesInFlight = updatesInFlight.filter(
                    (updateInFlight) => updateInFlight.clock !== event.clock
                  );

                  break;
                case "update-save-failed":
                  if (context.logging === "debug") {
                    console.log(
                      "update saving failed",
                      event.snapshotId,
                      event.clock,
                      event.requiresNewSnapshot
                    );
                  }

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
                case "ephemeral-message":
                  try {
                    const ephemeralMessage =
                      parseEphemeralMessageWithServerData(
                        event,
                        context.additionalAuthenticationDataValidations
                          ?.ephemeralMessage
                      );

                    const ephemeralMessageKey =
                      await context.getEphemeralMessageKey();

                    const isValidCollaborator =
                      await context.isValidCollaborator(
                        ephemeralMessage.publicData.pubKey
                      );
                    if (!isValidCollaborator) {
                      throw new Error("Invalid collaborator");
                    }

                    const ephemeralMessageResult =
                      verifyAndDecryptEphemeralMessage(
                        ephemeralMessage,
                        ephemeralMessageKey,
                        context._ephemeralMessagesSession,
                        context.signatureKeyPair,
                        context.sodium
                      );

                    if (ephemeralMessageResult.proof) {
                      send({
                        type: "ADD_EPHEMERAL_UPDATE",
                        data: ephemeralMessageResult.proof,
                        messageType: ephemeralMessageResult.requestProof
                          ? "proofAndRequestProof"
                          : "proof",
                      });
                    }

                    ephemeralMessagesSession.validSessions =
                      ephemeralMessageResult.validSessions;

                    // content can be undefined if it's a new session or the
                    // session data was invalid
                    if (ephemeralMessageResult.content) {
                      context.applyEphemeralMessages([
                        ephemeralMessageResult.content,
                      ]);
                    }
                  } catch (err) {
                    throw new SecsyncProcessingEphemeralMessageError(
                      "Failed to process ephemeral message",
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
                if (context.logging === "debug") {
                  console.debug("send snapshot");
                }
                await createAndSendSnapshot();
              } else {
                if (context.logging === "debug") {
                  console.debug("send update");
                }
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
              receivingEphemeralMessageErrors:
                context._receivingEphemeralMessageErrors,
              documentDecryptionState,
              ephemeralMessagesSession,
            };
          } catch (error) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error("Processing queue error:", error);
            }
            if (error instanceof SecsyncProcessingEphemeralMessageError) {
              const newReceivingEphemeralMessageErrors = [
                ...context._receivingEphemeralMessageErrors,
              ];
              newReceivingEphemeralMessageErrors.unshift(error);
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
                receivingEphemeralMessageErrors:
                  newReceivingEphemeralMessageErrors.slice(0, 20), // avoid a memory leak by storing max 20 errors
                documentDecryptionState,
                ephemeralMessagesSession,
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
