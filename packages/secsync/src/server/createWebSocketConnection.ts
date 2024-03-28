import { IncomingMessage } from "http";
import sodium from "libsodium-wrappers";
import { parse as parseUrl } from "url";
import { WebSocket } from "ws";
import { verifySignature } from "../crypto/verifySignature";
import { parseEphemeralMessage } from "../ephemeralMessage/parseEphemeralMessage";
import {
  SecsyncNewSnapshotRequiredError,
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
} from "../errors";
import { parseSnapshotWithClientData } from "../snapshot/parseSnapshotWithClientData";
import {
  AdditionalAuthenticationDataValidations,
  CreateSnapshotParams,
  CreateUpdateParams,
  GetDocumentParams,
  HasAccessParams,
  HasBroadcastAccessParams,
  Snapshot,
  SnapshotProofChainEntry,
  SnapshotUpdateClocks,
  Update,
} from "../types";
import { parseUpdate } from "../update/parseUpdate";
import { canonicalizeAndToBase64 } from "../utils/canonicalizeAndToBase64";
import { retryAsyncFunction } from "../utils/retryAsyncFunction";
import { addConnection, broadcastMessage, removeConnection } from "./store";

type GetDocumentResult = {
  snapshot?: Snapshot;
  snapshotProofChain?: SnapshotProofChainEntry[];
  updates: Update[];
};

type WebsocketConnectionParams = {
  getDocument(
    getDocumentParams: GetDocumentParams
  ): Promise<GetDocumentResult | undefined>;
  createSnapshot(createSnapshotParams: CreateSnapshotParams): Promise<Snapshot>;
  createUpdate(createUpdateParams: CreateUpdateParams): Promise<Update>;
  hasAccess(hasAccessParams: HasAccessParams): Promise<boolean>;
  hasBroadcastAccess(
    hasBroadcastAccessParams: HasBroadcastAccessParams
  ): Promise<boolean[]>;
  additionalAuthenticationDataValidations?: AdditionalAuthenticationDataValidations;
  /** default: "off" */
  logging?: "off" | "error";
};

export const createWebSocketConnection =
  ({
    getDocument,
    createSnapshot,
    createUpdate,
    hasAccess,
    hasBroadcastAccess,
    additionalAuthenticationDataValidations,
    logging: loggingParam,
  }: WebsocketConnectionParams) =>
  async (connection: WebSocket, request: IncomingMessage) => {
    const logging = loggingParam || "off";
    let documentId = "";

    const handleDocumentError = () => {
      connection.send(JSON.stringify({ type: "document-error" }));
      connection.close();
      removeConnection({
        documentId,
        websocket: connection,
      });
    };

    try {
      if (request.url === undefined) {
        handleDocumentError();
        return;
      }
      const urlParts = parseUrl(request.url, true);
      documentId = request.url?.slice(1)?.split("?")[0] || "";

      const websocketSessionKey = Array.isArray(urlParts.query.sessionKey)
        ? urlParts.query.sessionKey[0]
        : urlParts.query.sessionKey;

      // invalid connection without a sessionKey
      if (websocketSessionKey === undefined) {
        handleDocumentError();
        return;
      }

      const getDocumentModeString = Array.isArray(urlParts.query.mode)
        ? urlParts.query.mode[0]
        : urlParts.query.mode;
      const getDocumentMode =
        getDocumentModeString === "delta" ? "delta" : "complete";

      if (documentId === "") {
        handleDocumentError();
        return;
      }

      const documentAccess = await hasAccess({
        action: "read",
        documentId,
        websocketSessionKey,
      });
      if (!documentAccess) {
        connection.send(JSON.stringify({ type: "unauthorized" }));
        connection.close();
        return;
      }

      let knownSnapshotUpdateClocks: SnapshotUpdateClocks | undefined =
        undefined;
      try {
        const knownSnapshotUpdateClocksQueryEntry = Array.isArray(
          urlParts.query.knownSnapshotUpdateClocks
        )
          ? urlParts.query.knownSnapshotUpdateClocks[0]
          : urlParts.query.knownSnapshotUpdateClocks;
        if (knownSnapshotUpdateClocksQueryEntry) {
          knownSnapshotUpdateClocks = SnapshotUpdateClocks.parse(
            JSON.parse(decodeURIComponent(knownSnapshotUpdateClocksQueryEntry))
          );
        }
      } catch (err) {}

      const doc = await getDocument({
        documentId,
        knownSnapshotId: Array.isArray(urlParts.query.knownSnapshotId)
          ? urlParts.query.knownSnapshotId[0]
          : urlParts.query.knownSnapshotId,
        knownSnapshotUpdateClocks,
        mode: getDocumentMode,
      });

      if (!doc) {
        connection.send(JSON.stringify({ type: "document-not-found" }));
        connection.close();
        return;
      }

      addConnection({ documentId, websocket: connection, websocketSessionKey });
      connection.send(JSON.stringify({ type: "document", ...doc }));

      connection.on("message", async function message(messageContent) {
        const data = JSON.parse(messageContent.toString());

        // new snapshot
        if (data?.publicData?.snapshotId) {
          try {
            const snapshotMessage = parseSnapshotWithClientData(
              data,
              additionalAuthenticationDataValidations?.snapshot
            );

            const documentAccess = await hasAccess({
              action: "write-snapshot",
              documentId,
              publicKey: snapshotMessage.publicData.pubKey,
              websocketSessionKey,
            });
            if (!documentAccess) {
              connection.send(JSON.stringify({ type: "unauthorized" }));
              connection.close();
              return;
            }

            const snapshotPublicKey = sodium.from_base64(
              snapshotMessage.publicData.pubKey
            );
            const snapshotPublicDataAsBase64 = canonicalizeAndToBase64(
              snapshotMessage.publicData,
              sodium
            );
            const isValid = verifySignature(
              {
                nonce: snapshotMessage.nonce,
                ciphertext: snapshotMessage.ciphertext,
                publicData: snapshotPublicDataAsBase64,
              },
              "secsync_snapshot",
              snapshotMessage.signature,
              snapshotPublicKey,
              sodium
            );
            if (!isValid) {
              throw new Error("Snapshot message signature is not valid.");
            }

            const snapshot: Snapshot = await createSnapshot({
              snapshot: snapshotMessage,
            });
            connection.send(
              JSON.stringify({
                type: "snapshot-saved",
                snapshotId: snapshot.publicData.snapshotId,
              })
            );
            const snapshotMsgForOtherClients: Snapshot = {
              ciphertext: snapshotMessage.ciphertext,
              nonce: snapshotMessage.nonce,
              publicData: snapshotMessage.publicData,
              signature: snapshotMessage.signature,
            };
            broadcastMessage({
              documentId,
              message: {
                type: "snapshot",
                snapshot: snapshotMsgForOtherClients,
              },
              currentWebsocket: connection,
              hasBroadcastAccess,
            });
          } catch (error) {
            if (logging === "error") {
              console.error("SNAPSHOT FAILED ERROR:", error, data);
            }
            try {
              if (
                error instanceof SecsyncSnapshotBasedOnOutdatedSnapshotError
              ) {
                let document = await getDocument({
                  documentId,
                  knownSnapshotId: data.knownSnapshotId,
                  mode: "delta",
                });
                if (document) {
                  connection.send(
                    JSON.stringify({
                      type: "snapshot-save-failed",
                      snapshot: document.snapshot,
                      updates: document.updates,
                      snapshotProofChain: document.snapshotProofChain,
                    })
                  );
                } else {
                  if (logging === "error") {
                    console.error(
                      'document not found for "snapshotBasedOnOutdatedSnapshot" error'
                    );
                  }
                  connection.send(
                    JSON.stringify({
                      type: "snapshot-save-failed",
                    })
                  );
                }
              } else if (error instanceof SecsyncSnapshotMissesUpdatesError) {
                const document = await getDocument({
                  documentId,
                  knownSnapshotId: data.knownSnapshotId,
                  mode: "delta",
                });
                if (document) {
                  connection.send(
                    JSON.stringify({
                      type: "snapshot-save-failed",
                      updates: document.updates,
                    })
                  );
                } else {
                  // log since it's an unexpected error
                  if (logging === "error") {
                    console.error(
                      'document not found for "snapshotMissesUpdates" error'
                    );
                  }
                  connection.send(
                    JSON.stringify({
                      type: "snapshot-save-failed",
                    })
                  );
                }
              } else if (error instanceof SecsyncNewSnapshotRequiredError) {
                connection.send(
                  JSON.stringify({
                    type: "snapshot-save-failed",
                  })
                );
              } else {
                connection.send(
                  JSON.stringify({
                    type: "snapshot-save-failed",
                  })
                );
              }
            } catch (err) {
              // log since it's an unexpected error
              if (logging === "error") {
                console.error("SNAPSHOT FAILED ERROR HANDLING FAILED:", err);
              }
              connection.send(
                JSON.stringify({
                  type: "snapshot-save-failed",
                })
              );
            }
          }
          // new update
        } else if (data?.publicData?.refSnapshotId) {
          let savedUpdate: undefined | Update = undefined;
          try {
            const updateMessage = parseUpdate(
              data,
              additionalAuthenticationDataValidations?.update
            );

            const documentAccess = await hasAccess({
              action: "write-update",
              documentId,
              publicKey: updateMessage.publicData.pubKey,
              websocketSessionKey,
            });
            if (!documentAccess) {
              connection.send(JSON.stringify({ type: "unauthorized" }));
              connection.close();
              return;
            }

            const isValid = verifySignature(
              {
                nonce: updateMessage.nonce,
                ciphertext: updateMessage.ciphertext,
                publicData: canonicalizeAndToBase64(
                  updateMessage.publicData,
                  sodium
                ),
              },
              "secsync_update",
              updateMessage.signature,
              sodium.from_base64(updateMessage.publicData.pubKey),
              sodium
            );
            if (!isValid) {
              throw new Error("Update message signature is not valid.");
            }
            // const random = Math.floor(Math.random() * 10);
            // if (random < 8) {
            //   throw new Error("CUSTOM ERROR");
            // }

            savedUpdate = await retryAsyncFunction(
              () =>
                createUpdate({
                  update: updateMessage,
                }),
              [SecsyncNewSnapshotRequiredError]
            );
            if (savedUpdate === undefined) {
              throw new Error("Update could not be saved.");
            }

            connection.send(
              JSON.stringify({
                type: "update-saved",
                snapshotId: savedUpdate.publicData.refSnapshotId,
                clock: savedUpdate.publicData.clock,
              })
            );
            broadcastMessage({
              documentId,
              message: { ...savedUpdate, type: "update" },
              currentWebsocket: connection,
              hasBroadcastAccess,
            });
          } catch (err) {
            if (logging === "error") {
              console.error("update failed", err);
            }
            if (savedUpdate === null || savedUpdate === undefined) {
              connection.send(
                JSON.stringify({
                  type: "update-save-failed",
                  snapshotId: data.publicData.refSnapshotId,
                  clock: data.publicData.clock,
                  requiresNewSnapshot:
                    err instanceof SecsyncNewSnapshotRequiredError,
                })
              );
            }
          }
          // new ephemeral message
        } else {
          try {
            const ephemeralMessageMessage = parseEphemeralMessage(
              data,
              additionalAuthenticationDataValidations?.ephemeralMessage
            );

            const documentAccess = await hasAccess({
              action: "send-ephemeral-message",
              documentId,
              publicKey: ephemeralMessageMessage.publicData.pubKey,
              websocketSessionKey,
            });
            if (!documentAccess) {
              connection.send(JSON.stringify({ type: "unauthorized" }));
              connection.close();
              return;
            }

            const isValid = verifySignature(
              {
                nonce: ephemeralMessageMessage.nonce,
                ciphertext: ephemeralMessageMessage.ciphertext,
                publicData: canonicalizeAndToBase64(
                  ephemeralMessageMessage.publicData,
                  sodium
                ),
              },
              "secsync_ephemeral_message",
              ephemeralMessageMessage.signature,
              sodium.from_base64(ephemeralMessageMessage.publicData.pubKey),
              sodium
            );
            if (!isValid) {
              return {
                error: new Error("SECSYNC_ERROR_308"),
              };
            }

            broadcastMessage({
              documentId,
              message: {
                ...ephemeralMessageMessage,
                type: "ephemeral-message",
              },
              currentWebsocket: connection,
              hasBroadcastAccess,
            });
          } catch (err) {
            console.error("Ephemeral message failed due:", err);
          }
        }
      });

      connection.on("close", function () {
        removeConnection({ documentId, websocket: connection });
      });
    } catch (error) {
      if (logging === "error") {
        console.error(error);
      }
      handleDocumentError();
    }
  };
