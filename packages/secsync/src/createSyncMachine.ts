import type { KeyPair } from "libsodium-wrappers";
import {
  AnyActorRef,
  assertEvent,
  assign,
  forwardTo,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
  stopChild,
} from "xstate";
import { generateId } from "./crypto/generateId";
import { hash } from "./crypto/hash";
import { messageTypes } from "./ephemeralMessage/createEphemeralMessage";
import { createEphemeralSession } from "./ephemeralMessage/createEphemeralSession";
import { parseEphemeralMessage } from "./ephemeralMessage/parseEphemeralMessage";
import { verifyAndDecryptEphemeralMessage } from "./ephemeralMessage/verifyAndDecryptEphemeralMessage";
import { createInitialSnapshot } from "./snapshot/createInitialSnapshot";
import { createSnapshot } from "./snapshot/createSnapshot";
import { isValidAncestorSnapshot } from "./snapshot/isValidAncestorSnapshot";
import { parseSnapshot } from "./snapshot/parseSnapshot";
import { verifyAndDecryptSnapshot } from "./snapshot/verifyAndDecryptSnapshot";
import {
  EphemeralMessage,
  EphemeralMessagesSession,
  OnDocumentUpdatedEventType,
  Snapshot,
  SnapshotInfoWithUpdateClocks,
  SnapshotProofChainEntry,
  SnapshotProofInfo,
  SnapshotPublicData,
  SyncMachineConfig,
  Update,
} from "./types";
import { createUpdate } from "./update/createUpdate";
import { parseUpdate } from "./update/parseUpdate";
import { verifyAndDecryptUpdate } from "./update/verifyAndDecryptUpdate";
import { updateUpdateClocksEntry } from "./utils/updateUpdateClocksEntry";
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
// WebSockets reconnection logic:
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
// In case a snapshot is sent `_pendingChangesQueue` is cleared and the `_snapshotInFlight` set to the snapshot ID.
// In case an update is sent the changes will be added to the `_updatesInFlight` and the `_updatesLocalClock` increased by one.
//
// If a snapshot saved event is received
// - it is added to the `_snapshotInfosWithUpdateClocks`
// - the `_snapshotInFlight` is cleared.
// Queue processing for sending messages is resumed.
//
// If an update saved event is received
// - the `updateClocks` in the related snapshot are updated for the current client
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
// - set the `_updatesLocalClock` to the `updateClocks` the active snapshot for the current client
// - all the changes from this failed and later updates plus the new pendingChanges are taken and a new update is created and
// sent with the clock set to the latest confirmed clock + 1
//
// When loading the initial document it's important to make sure these variables are correctly set:
// - `_updatesLocalClock` (same as `updateClocks` for the current Client in the latest snapshot)
// - `_snapshotInfosWithUpdateClocks`

// Otherwise you might try to send an update that the server will reject.

type UpdateInFlight = {
  snapshotId: string;
  clock: number;
  changes: any[];
};

type SnapshotInFlight = SnapshotInfoWithUpdateClocks & {
  parentSnapshotId: string;
  changes: any[];
};

export type DocumentDecryptionState =
  | "pending"
  | "failed"
  | "partial"
  | "complete";

type ProcessQueueData =
  | {
      handledQueue: "customMessage" | "incoming" | "pending";
      snapshotInFlight: SnapshotInFlight | null;
      snapshotInfosWithUpdateClocks: SnapshotInfoWithUpdateClocks[];
      updatesLocalClock: number;
      updatesInFlight: UpdateInFlight[];
      pendingChangesToRemoveCount: number;
      pendingChangesToPrepend: any[];
      ephemeralMessageReceivingErrors: Error[];
      documentDecryptionState: DocumentDecryptionState;
      ephemeralMessagesSession: EphemeralMessagesSession | null;
      snapshotSaveFailedCounter: number;
      errorNotCausingDocumentToFail: Error | null;
    }
  | {
      handledQueue: "none";
      snapshotSaveFailedCounter: number;
      errorNotCausingDocumentToFail: Error | null;
    };

export type InternalContextReset = {
  _incomingQueue: any[];
  _customMessageQueue: any[];
  _snapshotInFlight: SnapshotInFlight | null;
  _updatesInFlight: UpdateInFlight[];
  _updatesLocalClock: number;
  _documentDecryptionState: DocumentDecryptionState;
  _ephemeralMessagesSession: EphemeralMessagesSession | null;
  _snapshotSaveFailedCounter: number;
};

export type Context = SyncMachineConfig &
  InternalContextReset & {
    _websocketRetries: number;
    _websocketActor?: AnyActorRef;
    _websocketShouldReconnect: boolean;
    _pendingChangesQueue: any[];
    _snapshotInfosWithUpdateClocks: SnapshotInfoWithUpdateClocks[];
    _snapshotAndUpdateErrors: Error[];
    _ephemeralMessageReceivingErrors: Error[];
    _ephemeralMessageAuthoringErrors: Error[];
    logging: SyncMachineConfig["logging"];
  };

const disconnectionContextReset: InternalContextReset = {
  _incomingQueue: [],
  _customMessageQueue: [],
  _snapshotInFlight: null,
  _updatesInFlight: [],
  _updatesLocalClock: -1,
  _documentDecryptionState: "pending",
  _ephemeralMessagesSession: null,
  _snapshotSaveFailedCounter: 0,
};

const scheduleRetry = fromCallback(
  ({
    sendBack,
    input,
  }: {
    input: { _websocketRetries: number; logging: SyncMachineConfig["logging"] };
    sendBack: any;
  }) => {
    const delay = 100 * 1.8 ** input._websocketRetries;
    if (input.logging === "debug") {
      console.debug(
        `schedule websocket connection #${input._websocketRetries} in `,
        delay
      );
    }
    setTimeout(() => {
      sendBack({ type: "WEBSOCKET_RETRY" });
      // calculating slow exponential back-off
    }, delay);
  }
);

const processQueues = fromPromise(
  async ({
    input,
  }: {
    input: { context: Context; event: any; parent: any };
    self: any;
    system: any;
  }): Promise<ProcessQueueData> => {
    const context = input.context;
    const event = input.event;
    // inspired by https://github.com/statelyai/xstate/discussions/4684
    const parent = input.parent;

    if (context.logging === "debug") {
      console.debug("processQueues event", event);
      console.debug("_incomingQueue", context._incomingQueue.length);
      console.debug("_customMessageQueue", context._customMessageQueue.length);
      console.debug(
        "_pendingChangesQueue",
        context._pendingChangesQueue.length
      );
    }

    let handledQueue: "customMessage" | "incoming" | "pending" | "none" =
      "none";
    let snapshotInfosWithUpdateClocks = context._snapshotInfosWithUpdateClocks;
    let activeSnapshotInfoWithUpdateClocks: SnapshotInfoWithUpdateClocks | null =
      snapshotInfosWithUpdateClocks[snapshotInfosWithUpdateClocks.length - 1] ||
      null;
    let snapshotInFlight = context._snapshotInFlight;
    let updatesLocalClock = context._updatesLocalClock;
    let updatesInFlight = context._updatesInFlight;
    let documentDecryptionState = context._documentDecryptionState;
    let ephemeralMessagesSession = context._ephemeralMessagesSession;
    let errorCausingDocumentToFail: Error | null = null;
    let errorNotCausingDocumentToFail: Error | null = null;
    let snapshotSaveFailedCounter = context._snapshotSaveFailedCounter;
    let pendingChangesToRemoveCount = 0;
    let pendingChangesToPrepend: any[] = [];

    let ephemeralMessageReceivingErrors =
      context._ephemeralMessageReceivingErrors;

    const invokeOnDocumentUpdated = (type: OnDocumentUpdatedEventType) => {
      try {
        if (context.onDocumentUpdated) {
          const snapshotInfosWithUpdateClocksEntry =
            snapshotInfosWithUpdateClocks[
              snapshotInfosWithUpdateClocks.length - 1
            ] || null;

          context.onDocumentUpdated({
            type,
            knownSnapshotInfo: {
              snapshotId: snapshotInfosWithUpdateClocksEntry.snapshotId,
              parentSnapshotProof:
                snapshotInfosWithUpdateClocksEntry.parentSnapshotProof,
              snapshotCiphertextHash:
                snapshotInfosWithUpdateClocksEntry.snapshotCiphertextHash,
              updateClocks: snapshotInfosWithUpdateClocksEntry.updateClocks,
              additionalPublicData:
                snapshotInfosWithUpdateClocksEntry.additionalPublicData,
            },
          });
        }
      } catch (err) {
        // logging anyway since this is a error by the developer implementing it
        console.error(err);
      }
    };

    try {
      const createAndSendSnapshot = async () => {
        try {
          const newSnapshotId = generateId(context.sodium);
          const snapshotData = await context.getNewSnapshotData({
            id: newSnapshotId,
          });
          if (context.logging === "debug") {
            console.log("createAndSendSnapshot", snapshotData);
          }
          // only if there is an entry we provide the object, and empty object is not
          // desired as it would be inconsistent
          const additionalPublicData =
            Object.keys(snapshotData.publicData).length === 0
              ? undefined
              : snapshotData.publicData;

          // no snapshot exists so far
          if (activeSnapshotInfoWithUpdateClocks === null) {
            const publicData: SnapshotPublicData = {
              ...snapshotData.publicData,
              snapshotId: newSnapshotId,
              docId: context.documentId,
              pubKey: context.sodium.to_base64(
                context.signatureKeyPair.publicKey
              ),
              parentSnapshotId: "",
              parentSnapshotUpdateClocks: {},
            };
            const snapshot = createInitialSnapshot(
              snapshotData.data,
              publicData,
              snapshotData.key,
              context.signatureKeyPair,
              context.sodium
            );

            pendingChangesToRemoveCount = context._pendingChangesQueue.length;
            snapshotInFlight = {
              updateClocks: {},
              snapshotId: snapshot.publicData.snapshotId,
              snapshotCiphertextHash: hash(snapshot.ciphertext, context.sodium),
              parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
              parentSnapshotId: snapshot.publicData.parentSnapshotId,
              changes: context._pendingChangesQueue,
              additionalPublicData,
            };

            parent.send({
              type: "SEND",
              message: JSON.stringify({
                ...snapshot,
                // Note: send a faulty message to test the error handling
                // ciphertext: "lala",
                additionalServerData: snapshotData.additionalServerData,
              }),
            });
          } else {
            const currentClientPublicKey = context.sodium.to_base64(
              context.signatureKeyPair.publicKey
            );
            const publicData: SnapshotPublicData = {
              ...snapshotData.publicData,
              snapshotId: newSnapshotId,
              docId: context.documentId,
              pubKey: currentClientPublicKey,
              parentSnapshotId: activeSnapshotInfoWithUpdateClocks.snapshotId,
              parentSnapshotUpdateClocks:
                activeSnapshotInfoWithUpdateClocks.updateClocks || {},
            };
            const snapshot = createSnapshot(
              snapshotData.data,
              publicData,
              snapshotData.key,
              context.signatureKeyPair,
              activeSnapshotInfoWithUpdateClocks.snapshotCiphertextHash,
              activeSnapshotInfoWithUpdateClocks.parentSnapshotProof,
              context.sodium
            );

            pendingChangesToRemoveCount = context._pendingChangesQueue.length;
            snapshotInFlight = {
              updateClocks: {},
              snapshotId: snapshot.publicData.snapshotId,
              snapshotCiphertextHash: hash(snapshot.ciphertext, context.sodium),
              parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
              parentSnapshotId: snapshot.publicData.parentSnapshotId,
              changes: context._pendingChangesQueue,
              additionalPublicData,
            };

            parent.send({
              type: "SEND",
              message: JSON.stringify({
                ...snapshot,
                // Note: send a faulty message to test the error handling
                // ciphertext: "lala",
                additionalServerData: snapshotData.additionalServerData,
              }),
            });
          }
        } catch (err) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(err);
          }
          errorCausingDocumentToFail = new Error("SECSYNC_ERROR_401");
        }
      };

      const createAndSendUpdate = async (
        changes: unknown[],
        activeSnapshotInfo: SnapshotInfoWithUpdateClocks,
        clock: number
      ) => {
        try {
          const key = await context.getSnapshotKey(activeSnapshotInfo);
          const refSnapshotId = activeSnapshotInfo.snapshotId;

          const update = context.serializeChanges(changes);
          updatesLocalClock = clock + 1;

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
            updatesLocalClock,
            context.sodium
          );

          updatesInFlight.push({
            snapshotId: refSnapshotId,
            clock: updatesLocalClock,
            changes,
          });
          parent.send({
            type: "SEND",
            message: JSON.stringify(message),
            // Note: send a faulty message to test the error handling
            // message: JSON.stringify({ ...message, ciphertext: "lala" }),
          });
        } catch (err) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(err);
          }
          errorCausingDocumentToFail = new Error("SECSYNC_ERROR_501");
        }
      };

      const processSnapshot = async (
        rawSnapshot: Snapshot,
        snapshotProofChain: SnapshotProofChainEntry[],
        knownSnapshotInfo?: SnapshotInfoWithUpdateClocks
      ) => {
        try {
          if (context.logging === "debug") {
            console.debug("processSnapshot", rawSnapshot);
          }
          let snapshot: Snapshot;
          let additionalPublicData: unknown;
          try {
            const parseSnapshotResult = parseSnapshot(
              rawSnapshot,
              context.additionalAuthenticationDataValidations?.snapshot
            );
            snapshot = parseSnapshotResult.snapshot;
            additionalPublicData = parseSnapshotResult.additionalPublicData;
          } catch (err) {
            errorNotCausingDocumentToFail = new Error("SECSYNC_ERROR_110");
            return;
          }

          try {
            const isValidClient = await context.isValidClient(
              snapshot.publicData.pubKey,
              snapshot.publicData
            );
            if (!isValidClient) {
              errorNotCausingDocumentToFail = new Error("SECSYNC_ERROR_114");
              return;
            }
          } catch (err) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(err);
            }
            errorCausingDocumentToFail = new Error("SECSYNC_ERROR_104");
            return;
          }

          const isAlreadyProcessedSnapshot =
            knownSnapshotInfo?.snapshotId === snapshot.publicData.snapshotId &&
            knownSnapshotInfo?.snapshotCiphertextHash ===
              hash(snapshot.ciphertext, context.sodium) &&
            knownSnapshotInfo?.parentSnapshotProof ===
              snapshot.publicData.parentSnapshotProof;

          if (isAlreadyProcessedSnapshot) {
            return;
          }

          let isValidAncestor = false;
          let parentSnapshotUpdateClock: number | undefined;

          if (knownSnapshotInfo && snapshotProofChain.length > 0) {
            isValidAncestor = isValidAncestorSnapshot({
              knownSnapshotProofEntry: knownSnapshotInfo,
              snapshotProofChain,
              currentSnapshot: snapshot,
              sodium: context.sodium,
            });
            parentSnapshotUpdateClock = undefined;
            if (!isValidAncestor) {
              errorNotCausingDocumentToFail = new Error("SECSYNC_ERROR_115");
              return;
            }
          } else {
            const parentSnapshotUpdateClocks = knownSnapshotInfo?.updateClocks;
            if (parentSnapshotUpdateClocks) {
              const currentClientPublicKey = context.sodium.to_base64(
                context.signatureKeyPair.publicKey
              );
              parentSnapshotUpdateClock =
                parentSnapshotUpdateClocks[currentClientPublicKey];
            }
          }

          let snapshotKey: Uint8Array;
          try {
            snapshotKey = await context.getSnapshotKey({
              snapshotId: snapshot.publicData.snapshotId,
              parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
              snapshotCiphertextHash: hash(snapshot.ciphertext, context.sodium),
              additionalPublicData,
            });
          } catch (err) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(err);
            }
            errorCausingDocumentToFail = new Error("SECSYNC_ERROR_103");
            return;
          }

          // console.log("processSnapshot key", snapshotKey);
          const decryptedSnapshotResult = verifyAndDecryptSnapshot(
            snapshot,
            snapshotKey,
            context.documentId,
            context.signatureKeyPair.publicKey,
            context.sodium,
            isValidAncestor ? undefined : knownSnapshotInfo,
            isValidAncestor ? undefined : parentSnapshotUpdateClock
          );

          if (decryptedSnapshotResult.error) {
            if (
              decryptedSnapshotResult.error.message === "SECSYNC_ERROR_100" ||
              decryptedSnapshotResult.error.message === "SECSYNC_ERROR_101" ||
              decryptedSnapshotResult.error.message === "SECSYNC_ERROR_102"
            ) {
              errorCausingDocumentToFail = decryptedSnapshotResult.error;
            } else {
              errorNotCausingDocumentToFail = decryptedSnapshotResult.error;
            }

            return;
          }

          try {
            context.applySnapshot(decryptedSnapshotResult.content);
          } catch (err) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(err);
            }
            errorCausingDocumentToFail = new Error("SECSYNC_ERROR_105");
            return;
          }
          // can be inserted in the last position since verifyAndDecryptSnapshot already verified the parent
          snapshotInfosWithUpdateClocks.push({
            updateClocks: {},
            snapshotId: snapshot.publicData.snapshotId,
            snapshotCiphertextHash: hash(snapshot.ciphertext, context.sodium),
            parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
            additionalPublicData,
          });

          // cleanup old snapshotInfosWithUpdateClocks entries and only keep the last 3 for debugging purposes
          // cleaning them up to avoid a memory leak
          snapshotInfosWithUpdateClocks =
            snapshotInfosWithUpdateClocks.slice(-3);
          updatesLocalClock = -1;

          invokeOnDocumentUpdated("snapshot-received");

          return additionalPublicData;
        } catch (err) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(err);
          }
          errorCausingDocumentToFail = new Error("SECSYNC_ERROR_100");
        }
      };

      const processUpdates = async (
        rawUpdates: Update[],
        relatedSnapshotInfo: SnapshotProofInfo
      ) => {
        try {
          let key: Uint8Array;
          try {
            key = await context.getSnapshotKey(relatedSnapshotInfo);
          } catch (err) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(err);
            }
            errorCausingDocumentToFail = new Error("SECSYNC_ERROR_206");
            return;
          }

          let changes: unknown[] = [];

          for (let rawUpdate of rawUpdates) {
            let update: Update;
            try {
              update = parseUpdate(
                rawUpdate,
                context.additionalAuthenticationDataValidations?.update
              );
            } catch (err) {
              errorNotCausingDocumentToFail = new Error("SECSYNC_ERROR_211");
              continue;
            }

            try {
              const isValidClient = await context.isValidClient(
                update.publicData.pubKey,
                update.publicData
              );
              if (!isValidClient) {
                errorNotCausingDocumentToFail = new Error("SECSYNC_ERROR_215");
                continue;
              }
            } catch (err) {
              if (context.logging === "debug" || context.logging === "error") {
                console.error(err);
              }
              errorCausingDocumentToFail = new Error("SECSYNC_ERROR_205");
              continue;
            }

            const unverifiedCurrentClock =
              snapshotInfosWithUpdateClocks[
                snapshotInfosWithUpdateClocks.length - 1
              ]?.updateClocks[update.publicData.pubKey];
            const currentClock = Number.isInteger(unverifiedCurrentClock)
              ? unverifiedCurrentClock
              : -1;

            const decryptUpdateResult = verifyAndDecryptUpdate(
              update,
              key,
              relatedSnapshotInfo.snapshotId,
              currentClock,
              context.sodium,
              context.logging
            );

            if (decryptUpdateResult.error) {
              const ignoreErrorList = [
                "SECSYNC_ERROR_211",
                "SECSYNC_ERROR_212",
                "SECSYNC_ERROR_213",
                "SECSYNC_ERROR_214",
                "SECSYNC_ERROR_215",
              ];
              if (ignoreErrorList.includes(decryptUpdateResult.error.message)) {
                errorNotCausingDocumentToFail = decryptUpdateResult.error;
                continue;
              } else {
                errorCausingDocumentToFail = decryptUpdateResult.error;
                continue;
              }
            }

            const { content, clock } = decryptUpdateResult;

            snapshotInfosWithUpdateClocks = updateUpdateClocksEntry({
              snapshotInfosWithUpdateClocks,
              snapshotId: relatedSnapshotInfo.snapshotId,
              clientPublicKey: update.publicData.pubKey,
              newClock: clock,
            });

            if (
              update.publicData.pubKey ===
              context.sodium.to_base64(context.signatureKeyPair.publicKey)
            ) {
              updatesLocalClock = update.publicData.clock;
            }
            try {
              const additionalChanges = context.deserializeChanges(
                context.sodium.to_string(content)
              );
              changes = changes.concat(additionalChanges);
            } catch (err) {
              if (context.logging === "debug" || context.logging === "error") {
                console.error(err);
              }
              errorCausingDocumentToFail = new Error("SECSYNC_ERROR_204");
            }
          }

          try {
            context.applyChanges(changes);
          } catch (err) {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(err);
            }
            errorCausingDocumentToFail = new Error("SECSYNC_ERROR_203");
          }

          invokeOnDocumentUpdated("update-received");
        } catch (err) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(err);
          }
          errorCausingDocumentToFail = new Error("SECSYNC_ERROR_200");
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

            if (
              context.loadDocumentParams?.mode !== "delta" &&
              !event.snapshot &&
              event.updates &&
              event.updates.length > 0
            ) {
              if (context.logging === "debug" || context.logging === "error") {
                console.error(
                  "Loading document mode was 'complete', but received updates without a snapshot"
                );
              }
              throw new Error("SECSYNC_ERROR_100");
            }

            let snapshotAdditionalPublicDataOnDocumentLoad: any = undefined;
            if (event.snapshot) {
              snapshotAdditionalPublicDataOnDocumentLoad =
                await processSnapshot(
                  event.snapshot,
                  event.snapshotProofChain || [],
                  context.loadDocumentParams?.knownSnapshotInfo
                );

              // if the initial snapshot fails the document can't be loaded
              if (errorNotCausingDocumentToFail) {
                errorCausingDocumentToFail = errorNotCausingDocumentToFail;
              }
            }

            if (errorCausingDocumentToFail === null) {
              documentDecryptionState = "partial";

              if (event.updates) {
                await processUpdates(
                  event.updates,
                  event.snapshot
                    ? {
                        snapshotId: event.snapshot.publicData.snapshotId,
                        parentSnapshotProof:
                          event.snapshot.publicData.parentSnapshotProof,
                        snapshotCiphertextHash: hash(
                          event.snapshot.ciphertext,
                          context.sodium
                        ),
                        additionalPublicData:
                          snapshotAdditionalPublicDataOnDocumentLoad,
                      }
                    : activeSnapshotInfoWithUpdateClocks
                );

                if (errorNotCausingDocumentToFail) {
                  errorCausingDocumentToFail = errorNotCausingDocumentToFail;
                }
              }
            }

            if (errorCausingDocumentToFail === null) {
              documentDecryptionState = "complete";
            }

            break;

          case "snapshot":
            if (context.logging === "debug") {
              console.log("snapshot", event);
            }
            await processSnapshot(
              event.snapshot,
              [],
              activeSnapshotInfoWithUpdateClocks
                ? activeSnapshotInfoWithUpdateClocks
                : undefined
            );

            break;

          case "snapshot-saved":
            if (context.logging === "debug") {
              console.log("snapshot saved", event);
            }

            if (
              // Ignore snapshot-saved for an event that is not in flight
              snapshotInFlight &&
              event.snapshotId === snapshotInFlight.snapshotId &&
              // Ignore snapshot saved if there is an activeSnapshot and
              // it doesn't match the currently active one.
              // This can happen if another snapshot event has been received already.
              (activeSnapshotInfoWithUpdateClocks === undefined ||
                activeSnapshotInfoWithUpdateClocks === null ||
                activeSnapshotInfoWithUpdateClocks.snapshotId ===
                  snapshotInFlight.parentSnapshotId)
            ) {
              snapshotSaveFailedCounter = 0; // reset the counter since we got a positive save response

              snapshotInfosWithUpdateClocks.push({
                ...snapshotInFlight,
                updateClocks: {},
              });

              invokeOnDocumentUpdated("snapshot-saved");

              snapshotInFlight = null;
              updatesLocalClock = -1;
            }

            break;
          case "snapshot-save-failed":
            snapshotSaveFailedCounter += 1;
            if (context.logging === "debug") {
              console.log("snapshot saving failed", event);
            }
            let snapshotAdditionalPublicData: any = undefined;

            if (event.snapshot) {
              snapshotAdditionalPublicData = await processSnapshot(
                event.snapshot,
                event.snapshotProofChain || [],
                activeSnapshotInfoWithUpdateClocks
              );
            }

            if (event.updates) {
              await processUpdates(
                event.updates,
                event.snapshot
                  ? {
                      snapshotId: event.snapshot.publicData.snapshotId,
                      parentSnapshotProof:
                        event.snapshot.publicData.parentSnapshotProof,
                      snapshotCiphertextHash: hash(
                        event.snapshot.ciphertext,
                        context.sodium
                      ),
                      additionalPublicData: snapshotAdditionalPublicData,
                    }
                  : activeSnapshotInfoWithUpdateClocks
              );
            }

            // put changes from the failed snapshot back in the queue
            pendingChangesToPrepend = snapshotInFlight?.changes || [];
            snapshotInFlight = null;

            if (context.logging === "debug") {
              console.log("retry send snapshot");
            }

            // skip another try if there is a snapshot in flight
            if (snapshotSaveFailedCounter < 5) {
              await createAndSendSnapshot();
            }
            break;

          case "update":
            await processUpdates([event], activeSnapshotInfoWithUpdateClocks);
            break;
          case "update-saved":
            if (context.logging === "debug") {
              console.debug("update saved", event);
            }
            snapshotSaveFailedCounter = 0; // reset the counter since we got a positive save response

            // only increases if the event.clock is larger since the server
            // might have returned them out of order
            snapshotInfosWithUpdateClocks = updateUpdateClocksEntry({
              snapshotInfosWithUpdateClocks,
              clientPublicKey: context.sodium.to_base64(
                context.signatureKeyPair.publicKey
              ),
              snapshotId: event.snapshotId,
              newClock: event.clock,
            });
            updatesInFlight = updatesInFlight.filter(
              (updateInFlight) =>
                !(
                  updateInFlight.clock === event.clock &&
                  updateInFlight.snapshotId === event.snapshotId
                )
            );

            invokeOnDocumentUpdated("update-saved");
            break;
          case "update-save-failed":
            if (context.logging === "debug") {
              console.log(
                "update saving failed",
                event,
                " referencing active snapshot: ",
                activeSnapshotInfoWithUpdateClocks.snapshotId ===
                  event.snapshotId
              );
            }

            if (event.requiresNewSnapshot) {
              await createAndSendSnapshot();
            } else {
              // collect all changes that are in flight and put them back into the queue
              const changes = updatesInFlight.reduce(
                (acc, updateInFlight) => acc.concat(updateInFlight.changes),
                [] as any[]
              );
              updatesInFlight = [];
              // put the changes from the failed updated and after back to the queue
              pendingChangesToPrepend = changes;

              const currentClientPublicKey = context.sodium.to_base64(
                context.signatureKeyPair.publicKey
              );
              const unverifiedCurrentClock =
                snapshotInfosWithUpdateClocks[
                  snapshotInfosWithUpdateClocks.length - 1
                ]?.updateClocks[currentClientPublicKey];
              updatesLocalClock = Number.isInteger(unverifiedCurrentClock)
                ? unverifiedCurrentClock
                : -1;
            }

            break;
          case "ephemeral-message":
            // used so we can do early return
            const handleEphemeralMessage = async () => {
              try {
                let ephemeralMessage: EphemeralMessage;
                try {
                  ephemeralMessage = parseEphemeralMessage(
                    event,
                    context.additionalAuthenticationDataValidations
                      ?.ephemeralMessage
                  );
                } catch (err) {
                  if (context.logging === "error") {
                    console.error(err);
                  }
                  ephemeralMessageReceivingErrors.unshift(
                    new Error("SECSYNC_ERROR_307")
                  );
                  return;
                }

                const key = await context.getSnapshotKey(
                  activeSnapshotInfoWithUpdateClocks
                );

                let isValidClient: boolean;
                try {
                  isValidClient = await context.isValidClient(
                    ephemeralMessage.publicData.pubKey,
                    ephemeralMessage.publicData
                  );
                } catch (err) {
                  if (context.logging === "error") {
                    console.error(err);
                  }
                  isValidClient = false;
                }

                if (!isValidClient) {
                  ephemeralMessageReceivingErrors.unshift(
                    new Error("SECSYNC_ERROR_304")
                  );
                  return;
                }

                if (ephemeralMessagesSession === null) {
                  if (
                    context.logging === "error" ||
                    context.logging === "debug"
                  ) {
                    console.error(
                      "context._ephemeralMessagesSession is not defined"
                    );
                  }
                  return;
                }

                const ephemeralMessageResult = verifyAndDecryptEphemeralMessage(
                  ephemeralMessage,
                  key,
                  context.documentId,
                  ephemeralMessagesSession,
                  context.signatureKeyPair,
                  context.sodium,
                  context.logging
                );

                if (ephemeralMessageResult.error) {
                  ephemeralMessageReceivingErrors.unshift(
                    ephemeralMessageResult.error
                  );
                }

                if (ephemeralMessageResult.proof) {
                  parent.send({
                    type: "ADD_EPHEMERAL_MESSAGE",
                    data: ephemeralMessageResult.proof,
                    messageType: ephemeralMessageResult.requestProof
                      ? "proofAndRequestProof"
                      : "proof",
                  });
                }

                if (ephemeralMessageResult.validSessions) {
                  ephemeralMessagesSession.validSessions =
                    ephemeralMessageResult.validSessions;
                }

                // content can be undefined if it's a new session or the
                // session data was invalid
                if (ephemeralMessageResult.content) {
                  context.applyEphemeralMessage(
                    ephemeralMessageResult.content,
                    ephemeralMessage.publicData.pubKey
                  );
                }
              } catch (err) {
                if (
                  context.logging === "error" ||
                  context.logging === "debug"
                ) {
                  console.error(err);
                }
                ephemeralMessageReceivingErrors.unshift(
                  new Error("SECSYNC_ERROR_300")
                );
                return;
              }
            };

            await handleEphemeralMessage();
            break;
        }
      } else if (
        context._pendingChangesQueue.length > 0 &&
        snapshotInFlight === null
      ) {
        if (documentDecryptionState !== "complete") {
          // pending changes are ignored until the document is loaded
          return {
            handledQueue: "none",
            snapshotSaveFailedCounter,
            errorNotCausingDocumentToFail,
          };
        }

        handledQueue = "pending";

        const snapshotUpdatesCount = Object.entries(
          snapshotInfosWithUpdateClocks[
            snapshotInfosWithUpdateClocks.length - 1
          ]?.updateClocks || {}
        ).reduce((prev, curr) => {
          return prev + curr[1];
        }, 0);

        if (
          activeSnapshotInfoWithUpdateClocks === null ||
          context.shouldSendSnapshot({
            activeSnapshotId:
              activeSnapshotInfoWithUpdateClocks?.snapshotId || null,
            snapshotUpdatesCount,
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
          pendingChangesToRemoveCount = context._pendingChangesQueue.length;

          await createAndSendUpdate(
            context._pendingChangesQueue,
            activeSnapshotInfoWithUpdateClocks,
            updatesLocalClock
          );
        }
      }

      if (errorCausingDocumentToFail) {
        throw errorCausingDocumentToFail;
      }

      return {
        handledQueue,
        snapshotInfosWithUpdateClocks,
        snapshotInFlight,
        updatesLocalClock,
        updatesInFlight,
        pendingChangesToPrepend,
        pendingChangesToRemoveCount,
        ephemeralMessageReceivingErrors: ephemeralMessageReceivingErrors.slice(
          0,
          20
        ), // avoid a memory leak by storing max 20 errors
        documentDecryptionState,
        ephemeralMessagesSession,
        snapshotSaveFailedCounter,
        errorNotCausingDocumentToFail,
      };
    } catch (error) {
      if (context.logging === "debug" || context.logging === "error") {
        console.error("Processing queue error:", error);
      }

      // @ts-ignore fails on some environments and not in others
      error.documentDecryptionState = documentDecryptionState;
      throw error;
    }
  }
);

export const createSyncMachine = () => {
  /** @xstate-layout N4IgpgJg5mDOIC5SwJ4DsDGBZAhhgFgJZpgDEAygKIByAIgNoAMAuoqAA4D2shALoZzRsQAD0QBGAEwBOaQDoA7AoBsAFgAc45WoDMa5QBoQKCYwVzJC1VYXrV0nQ4CskgL6ujqTLgLEyAQVpaAH1KAAUACUosSgAlfwAZYJjycn8AcUomViQQLh5+QWExBClxeUkZFw1xdSdGSR0jE1K3DxAvbDwiElIAdUoAIXIAeQBhAGlKABVg2gBJcjGR6mpKMenKBhZhfL4BIVyS5QVmxFVHORdGdR1xPScFKXUFd090Lt9ehaWVtY3srtuPsikdECczgg9PJrnYdE5pOJ7i43h0Pj4emQAGL+eYJLbBMaxSj+abzajpUKRaJxRLJSipDJZHa5PaFQ6gEpI5TqOTqZTiBQ3NQKaSVQzGCQCxhyO6MVQucSMeU3NrvbzdPxyDCCEgYfhoKD9IajSYzQl-dabbY5DjA9nFKU8uSC24Kxj3aTKpyQ+yqPmqZTw1SqQXSfmMJyozoYrU6tB6g1GwIhMYRfwUhmA1n2g6OqHiR4WJw6UO1aROepNSUISziPlinQKSrSHlKyvR9Gakja3VgfXEKByADuOH2huNw3GU1mxOmsQAmtm7QU82DSuJQ7LNBchapJEqm76lIpS3V5V6nFo1J2NV8wL2E-3eJBJ6aZ3NxgBVGLUWbUEZZixEYvzoZc8lzUFOUQSQGh0ORA0DJsTlUBp1Ehe5tBdQN1GkENZAFLRb0+TFH0TV8BinM1ZlA-wv2mCIRlieYAC0tnAtk12g2tlXgxCgxUKw0IwxULERJt1EYHkrCcZRiNjHt43IiA32nc1aG-X9ZjiWImI4yCOVEGC4IQ-RkKEyR0JrTdCzkaRmybQsrzuPD5O7B8lOfSA5EICAABsyEo99zRTYJphGYJyWWLByUpABFL9KES-TVygozayVORlCcdRz0IoV6h9aytHkZRwz0dRJEeFwo3aGN3LIryIB8-zApNNTZlC8LCS-chwqwelGUyYIEqS5lbQg1LDJKA8ZWy3L6nyyNIwwyQ1Ds5tw1uRgdFVV46q7e9Gv1bzfIC0hQrTDNMnIFKQWmmDMvmvKkQKlbrL0GVJGsBQ9ELb6VDkg671IzyTua9gACdOAwOAeENOKAFcwGR2BSAgQQH2IAA3TgAGsHyhmG4aRlG4Duh11yVXCrmynblB2yTvqslpXv9WwrG+pFyiVNU0RBuM+3BuQidh2B4agUnUdIMBIehyGRb8nBeAAM04SGAFsRehsXYCl8mWRXe781g+5TKQwTUMs1bfr5X6FUqhRK0aNyjrBl8IZ1uHB31tGgo64IuoiqKRhiikRsS5LDcm431x5f0tE3UMZCFLRVFW+oEPLHK7l+77XdBoWPe14nxZ95Hpf96jA6CMKIrGXr+sGtJhtGqOJs4tLjkz7nwzW+wpEqDCnOwi4dEdwVtFUAvBafYXRe9hGK7gC7a6uzNbujzuHoQTnFA0J4S1kQ-xAwyN5H5CsvX3Rpm3UGfFKL7yCH7PHByxdWsHVsB9fmF8Nb9u1auQdIrUGirFCOY0KZcXSoWW2UklT0xuCoRow9lCSCyvKK8zYGYuGbA-DyT9movwwG-Q0H9IZf0hj-Zef8wAANUsA2u3UG59VDs3JkkD25AimvmQslwPRaEaAzBwlUiqsykuYHQKcyplnuOPAhx1i4kLIVAChVCaFkzoQwy66YN7QK7lKO4WUNCNFuC8WC6caz2QwZGeoB5ZKClQjoRR7tn74Ffu-T+39f7-zRiIWAvBlYPhwCrF8kMAAUjAACUpB6puyIdqDxpCvGUJ8bQvxBid6DwwfcD0skQz1HuKtE4cgpLCh2vCWQtxXGJJUakjRvj6H+MCcEuQoTwlRNifEwuc9lHJNUeo9JWjMniA7gZPhu0ZS5Q9GtE4pYGgShaHhGUFYrCaGkaGXa99gYkS1BAQgsA3EqV0ddLMW8Jnrm+oweQzxAwqHHjyPQkJdrwWVPI6wMyHCBkUQco5RDSDLFWFaLJ+ZcFZTWrnZOGhx6+nlC6IMLw4G7SsL8w5xzSCgrjpGCFQYnFSBhSzc4DNZRVVbE2SyOVdC1L6d5BeZcl5kzRhjHsON8aEy9uLX29Axk8Njtxa8vJXSliKY4b0voqqyg9MqfckYgw8ncO0NAnAIBwGED0vwfLKYCqWRIOwtM8IqHpvNawNLEyDi1TAkoSh6y3FgjoceKhXrSBeU4BOJxEEaFQk7Wq6o9mPz6YOOQ1DeCQxQBanMvCqbBjEpoQiqFUJ2F9FuewvEvS4SqgiM1z4g2jnHFAS1hiECaAvtIypLx8ouprAqf0GhJJ1CdioaqLjdkKUIbSiAhad5qEhJJZQfJIz3FwhcDQJZs3CzOmALtfCpCrUqmU688jHi2AuOO4u9KJa+2nXHVsfIuayG5sqNaGF4RzQcEKAU2gnhKDXe4zx5DvHUKaQA7dOryiktQonFQ9h+QlIwS8MU2UlSyFgvtP1ba5B-OOa+9K8J6z3C2XoRw8rxHnB2hYI1JYk4yFDIo5V-gMC6xgzNJs8EbEHgWpuRwpxrKmLsoiQpOUZCVUUSrMcAVO2Rv5elMxZHmwUbqFR+yJ6TwnG+mK7KlZZKKtcEAA */
  return setup({
    types: {} as {
      events:
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
            type: "ADD_EPHEMERAL_MESSAGE";
            data: any;
            messageType?: keyof typeof messageTypes;
          }
        | {
            type: "SEND_EPHEMERAL_MESSAGE";
            data: any;
            messageType: keyof typeof messageTypes;
            getKey: () => Uint8Array | Promise<Uint8Array>;
          }
        | {
            type: "FAILED_CREATING_EPHEMERAL_MESSAGE";
            error: any;
          }
        | { type: "SEND"; message: any };
      context: Context;
      input: SyncMachineConfig;
      children: {
        scheduleRetry: "scheduleRetry";
        processQueues: "processQueues";
        websocketActor: "websocketActor";
      };
    },
    actions: {
      resetWebsocketRetries: assign({
        _websocketRetries: 0,
      }),
      increaseWebsocketRetry: assign(({ context }) => {
        // limit it to 13 to prevent too long apart retries
        if (context._websocketRetries < 13) {
          return { _websocketRetries: context._websocketRetries + 1 };
        }
        return { _websocketRetries: context._websocketRetries };
      }),
      spawnWebsocketActor: assign(({ context, spawn }) => {
        // the counter in there is only the initial counter and actually
        // increased with ever ephemeral message sent inside "websocketActor"
        const ephemeralMessagesSession = createEphemeralSession(context.sodium);

        // based on loadDocumentParams the _snapshotInfosWithUpdateClocks is initialized
        // if loadDocumentParams exist and mode is "delta" the _snapshotInfosWithUpdateClocks the expectation
        // is that the same snapshot should not be returned by the backend and therefor is expected to by in
        // _snapshotInfosWithUpdateClocks
        //
        // in any other case the _snapshotInfosWithUpdateClocks is empty and the first snapshot received from the backend
        // is the one that should be applied
        // if loadDocumentParams.knownSnapshotInfo the snapshot ancestor relationship should still be validated

        return {
          _snapshotInfosWithUpdateClocks:
            context.loadDocumentParams?.mode === "delta"
              ? [context.loadDocumentParams.knownSnapshotInfo]
              : [],
          _ephemeralMessagesSession: ephemeralMessagesSession,
          // TODO switch to spawnChild? https://stately.ai/docs/spawn
          _websocketActor: spawn("websocketActor", {
            id: "websocketActor",
            input: {
              context,
              ephemeralMessagesSession,
            },
          }),
        };
      }),
      stopWebsocketActor: assign(({ context }) => {
        return {
          _websocketActor: undefined,
        };
      }),
      resetContext: assign(({ context, event }) => {
        if (context.logging === "debug") {
          console.log("resetContext");
        }
        let unconfirmedChanges = context._updatesInFlight.reduce(
          (accumulator, updateInFlight) => {
            return [...accumulator, ...updateInFlight.changes];
          },
          [] as any[]
        );
        unconfirmedChanges = [
          ...unconfirmedChanges,
          ...context._pendingChangesQueue,
        ];

        const activeSnapshotInfo =
          context._snapshotInfosWithUpdateClocks[
            context._snapshotInfosWithUpdateClocks.length - 1
          ];

        return {
          // reset the context and make sure there are no stale references
          // using JSON.parse(JSON.stringify()) to make sure we have a clean copy
          ...JSON.parse(JSON.stringify(disconnectionContextReset)),
          // update loadDocumentParams to only fetch and verify the new relevant data
          // Note: _snapshotInfosWithUpdateClocks also must be set, which is done in spawnWebsocketActor
          loadDocumentParams: activeSnapshotInfo
            ? {
                knownSnapshotInfo: activeSnapshotInfo,
                mode: "delta",
              }
            : context.loadDocumentParams,
          // collected all unconfirmed changes to avoid them getting lost
          _pendingChangesQueue: unconfirmedChanges,
          _websocketShouldReconnect: event.type !== "DISCONNECT",
        };
      }),
      addToIncomingQueue: assign(({ context, event }) => {
        assertEvent(event, "WEBSOCKET_ADD_TO_INCOMING_QUEUE");
        return {
          _incomingQueue: [...context._incomingQueue, event.data],
        };
      }),
      addToCustomMessageQueue: assign(({ context, event }) => {
        assertEvent(event, "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE");
        return {
          _customMessageQueue: [...context._customMessageQueue, event.data],
        };
      }),
      addToPendingUpdatesQueue: assign(({ context, event }) => {
        assertEvent(event, "ADD_CHANGES");
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
      removeOldestItemFromQueueAndUpdateContext: assign(
        ({ context, event }) => {
          const castedEvent = event as unknown as { output: ProcessQueueData };
          const snapshotAndUpdateErrors = context._snapshotAndUpdateErrors;
          if (castedEvent.output.errorNotCausingDocumentToFail) {
            snapshotAndUpdateErrors.unshift(
              castedEvent.output.errorNotCausingDocumentToFail
            );
          }

          if (castedEvent.output.handledQueue === "incoming") {
            return {
              _incomingQueue: context._incomingQueue.slice(1),
              // because changes might have been add while processing the queue ans creating a
              // snapshot or update we can't just overwrite the _pendingChangesQueue
              // instead we need to track how many to remove from the beginning of the list
              // and of some should be restored also add them to the list
              _pendingChangesQueue:
                castedEvent.output.pendingChangesToPrepend.concat(
                  context._pendingChangesQueue.slice(
                    castedEvent.output.pendingChangesToRemoveCount
                  )
                ),
              _snapshotInfosWithUpdateClocks:
                castedEvent.output.snapshotInfosWithUpdateClocks,
              _snapshotInFlight: castedEvent.output.snapshotInFlight,
              _updatesLocalClock: castedEvent.output.updatesLocalClock,
              _updatesInFlight: castedEvent.output.updatesInFlight,
              _ephemeralMessageReceivingErrors:
                castedEvent.output.ephemeralMessageReceivingErrors,
              _documentDecryptionState:
                castedEvent.output.documentDecryptionState,
              _ephemeralMessagesSession:
                castedEvent.output.ephemeralMessagesSession,
              _snapshotAndUpdateErrors: snapshotAndUpdateErrors,
              _snapshotSaveFailedCounter:
                castedEvent.output.snapshotSaveFailedCounter,
            };
          } else if (castedEvent.output.handledQueue === "customMessage") {
            return {
              _customMessageQueue: context._customMessageQueue.slice(1),
              // because changes might have been add while processing the queue ans creating a
              // snapshot or update we can't just overwrite the _pendingChangesQueue
              // instead we need to track how many to remove from the beginning of the list
              // and of some should be restored also add them to the list
              _pendingChangesQueue:
                castedEvent.output.pendingChangesToPrepend.concat(
                  context._pendingChangesQueue.slice(
                    castedEvent.output.pendingChangesToRemoveCount
                  )
                ),
              _snapshotInfosWithUpdateClocks:
                castedEvent.output.snapshotInfosWithUpdateClocks,
              _snapshotInFlight: castedEvent.output.snapshotInFlight,
              _updatesLocalClock: castedEvent.output.updatesLocalClock,
              _updatesInFlight: castedEvent.output.updatesInFlight,
              _ephemeralMessageReceivingErrors:
                castedEvent.output.ephemeralMessageReceivingErrors,
              _ephemeralMessagesSession:
                castedEvent.output.ephemeralMessagesSession,
              _documentDecryptionState:
                castedEvent.output.documentDecryptionState,
              _snapshotAndUpdateErrors: snapshotAndUpdateErrors,
              _snapshotSaveFailedCounter:
                castedEvent.output.snapshotSaveFailedCounter,
            };
          } else if (castedEvent.output.handledQueue === "pending") {
            return {
              // because changes might have been add while processing the queue ans creating a
              // snapshot or update we can't just overwrite the _pendingChangesQueue
              // instead we need to track how many to remove from the beginning of the list
              // and of some should be restored also add them to the list
              _pendingChangesQueue:
                castedEvent.output.pendingChangesToPrepend.concat(
                  context._pendingChangesQueue.slice(
                    castedEvent.output.pendingChangesToRemoveCount
                  )
                ),
              _snapshotInfosWithUpdateClocks:
                castedEvent.output.snapshotInfosWithUpdateClocks,
              _snapshotInFlight: castedEvent.output.snapshotInFlight,
              _updatesLocalClock: castedEvent.output.updatesLocalClock,
              _updatesInFlight: castedEvent.output.updatesInFlight,
              _ephemeralMessageReceivingErrors:
                castedEvent.output.ephemeralMessageReceivingErrors,
              _ephemeralMessagesSession:
                castedEvent.output.ephemeralMessagesSession,
              _documentDecryptionState:
                castedEvent.output.documentDecryptionState,
              _snapshotAndUpdateErrors: snapshotAndUpdateErrors,
              _snapshotSaveFailedCounter:
                castedEvent.output.snapshotSaveFailedCounter,
            };
          } else if (castedEvent.output.handledQueue === "none") {
            return {};
          } else {
            throw new Error("Unhandled queue");
          }
        }
      ),
      updateEphemeralMessageAuthoringErrors: assign(({ context, event }) => {
        assertEvent(event, "FAILED_CREATING_EPHEMERAL_MESSAGE");
        return {
          _ephemeralMessageAuthoringErrors: [
            event.error,
            ...context._ephemeralMessageAuthoringErrors,
          ].slice(0, 20), // avoid a memory leak by storing max 20 errors
        };
      }),
    },
    actors: {
      scheduleRetry,
      processQueues,
      websocketActor: websocketService,
    },
    guards: {
      hasMoreItemsInQueues: ({ context }) => {
        return (
          context._customMessageQueue.length > 0 ||
          context._incomingQueue.length > 0 ||
          context._pendingChangesQueue.length > 0
        );
      },
      shouldReconnect: ({ context }) => {
        return context._websocketShouldReconnect;
      },
    },
  }).createMachine({
    context: ({ input }) => {
      if (!input) {
        throw new Error("SECSYNC: input is required");
      }
      return {
        ...{
          documentId: input.documentId,
          signatureKeyPair: {} as KeyPair,
          websocketHost: "",
          websocketSessionKey: "",
          applySnapshot: () => undefined,
          getSnapshotKey: () => Promise.resolve(new Uint8Array()),
          applyChanges: () => undefined,
          getNewSnapshotData: () => ({
            data: "",
            key: new Uint8Array(),
            publicData: {},
          }),
          applyEphemeralMessage: () => undefined,
          shouldSendSnapshot: () => false,
          sodium: {},
          serializeChanges: () => "",
          deserializeChanges: () => [],
          onDocumentUpdated: undefined,
          isValidClient: async () => false,
          logging: "off",
          additionalAuthenticationDataValidations: undefined,
          _snapshotInFlight: null, // it is needed so the the snapshotInFlight can be applied as the activeSnapshot once the server confirmed that it has been saved
          _incomingQueue: [],
          _customMessageQueue: [],
          _pendingChangesQueue: [],
          _snapshotInfosWithUpdateClocks: [],
          _websocketShouldReconnect: false,
          _websocketRetries: 0,
          _updatesInFlight: [], // is needed to collect all changes from updates that haven't been confirmed in case of a disconnect
          _updatesLocalClock: -1,
          _snapshotAndUpdateErrors: [],
          _snapshotSaveFailedCounter: 0,
          _ephemeralMessageReceivingErrors: [],
          _ephemeralMessageAuthoringErrors: [],
          _ephemeralMessagesSession: null,
          _documentDecryptionState: "pending",
        },
        ...input,
      };
    },
    initial: "connecting",
    on: {
      SEND: {
        actions: forwardTo("websocketActor"),
      },
      ADD_EPHEMERAL_MESSAGE: {
        actions: sendTo("websocketActor", ({ context, event }) => {
          return {
            type: "SEND_EPHEMERAL_MESSAGE",
            data: event.data,
            messageType: event.messageType || "message",
            getKey: async () => {
              const activeSnapshotInfo =
                context._snapshotInfosWithUpdateClocks[
                  context._snapshotInfosWithUpdateClocks.length - 1
                ];
              const key = await context.getSnapshotKey(activeSnapshotInfo);
              return key;
            },
          };
        }),
      },
      WEBSOCKET_DISCONNECTED: { target: ".disconnected" },
      DISCONNECT: { target: ".disconnected" },
      FAILED_CREATING_EPHEMERAL_MESSAGE: {
        actions: ["updateEphemeralMessageAuthoringErrors"],
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
              input: ({ context }) => ({
                _websocketRetries: context._websocketRetries,
                logging: context.logging,
              }),
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
              input: ({ context, event, self }) => {
                return {
                  context,
                  event,
                  parent: self,
                };
              },
              onDone: [
                {
                  // Note: guard runs before the actions
                  guard: ({ event }) => {
                    const {
                      errorNotCausingDocumentToFail,
                      snapshotSaveFailedCounter,
                    } = event.output;

                    return (
                      snapshotSaveFailedCounter < 5 &&
                      !(
                        errorNotCausingDocumentToFail &&
                        ["SECSYNC_ERROR_112", "SECSYNC_ERROR_115"].includes(
                          errorNotCausingDocumentToFail.message
                        )
                      )
                    );
                  },
                  actions: ["removeOldestItemFromQueueAndUpdateContext"],
                  target: "checkingForMoreQueueItems",
                },
                {
                  actions: ["removeOldestItemFromQueueAndUpdateContext"],
                  target: "#syncMachine.disconnected",
                },
              ],
              onError: {
                actions: assign(({ context, event }) => {
                  return {
                    _documentDecryptionState:
                      // @ts-expect-error documentDecryptionState is dynamically added to the error event
                      event.error?.documentDecryptionState ||
                      context._documentDecryptionState,
                    _snapshotAndUpdateErrors: [
                      event.error as Error,
                      ...context._snapshotAndUpdateErrors,
                    ],
                  };
                }),
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
                  guard: "hasMoreItemsInQueues",
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
        entry: [
          "resetContext",
          stopChild("websocketActor"),
          "stopWebsocketActor",
        ],
        always: {
          target: "connecting",
          guard: "shouldReconnect",
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
        entry: [stopChild("websocketActor"), "stopWebsocketActor"],
      },
      failed: {
        entry: [stopChild("websocketActor"), "stopWebsocketActor"],
      },
    },
    id: "syncMachine",
  });
};
