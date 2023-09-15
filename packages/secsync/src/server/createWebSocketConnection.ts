import { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { WebSocket } from "ws";
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
  Snapshot,
  Update,
} from "../types";
import { parseUpdate } from "../update/parseUpdate";
import { retryAsyncFunction } from "../utils/retryAsyncFunction";
import { addConnection, addUpdate, removeConnection } from "./store";

type GetDocumentResult = {
  snapshot?: Snapshot;
  updates: Update[];
  snapshotProofChain: {
    id: string;
    parentSnapshotProof: string;
    snapshotCiphertextHash: string;
  }[];
};

type WebsocketConnectionParams = {
  getDocument(
    getDocumentParams: GetDocumentParams
  ): Promise<GetDocumentResult | undefined>;
  createSnapshot(createSnapshotParams: CreateSnapshotParams): Promise<Snapshot>;
  createUpdate(createUpdateParams: CreateUpdateParams): Promise<Update>;
  hasAccess(hasAccessParams: HasAccessParams): Promise<boolean>;
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
    additionalAuthenticationDataValidations,
    logging: loggingParam,
  }: WebsocketConnectionParams) =>
  async (connection: WebSocket, request: IncomingMessage) => {
    const logging = loggingParam || "off";
    let documentId = "";

    const handleDocumentError = () => {
      connection.send(JSON.stringify({ type: "document-error" }));
      connection.close();
      removeConnection(documentId, connection);
    };

    try {
      if (request.url === undefined) {
        handleDocumentError();
        return;
      }
      const urlParts = parseUrl(request.url, true);
      documentId = request.url?.slice(1)?.split("?")[0] || "";

      if (documentId === "") {
        handleDocumentError();
        return;
      }

      const documentAccess = await hasAccess({ action: "read", documentId });
      if (!documentAccess) {
        connection.send(JSON.stringify({ type: "unauthorized" }));
        connection.close();
        return;
      }

      const doc = await getDocument({
        documentId,
        lastKnownSnapshotId: Array.isArray(urlParts.query.lastKnownSnapshotId)
          ? urlParts.query.lastKnownSnapshotId[0]
          : urlParts.query.lastKnownSnapshotId,
      });

      if (!doc) {
        connection.send(JSON.stringify({ type: "document-not-found" }));
        connection.close();
        return;
      }

      addConnection(documentId, connection);
      connection.send(JSON.stringify({ type: "document", ...doc }));

      connection.on("message", async function message(messageContent) {
        const data = JSON.parse(messageContent.toString());

        // new snapshot
        if (data?.publicData?.snapshotId) {
          const documentAccess = await hasAccess({
            action: "write-snapshot",
            documentId,
          });
          if (!documentAccess) {
            connection.send(JSON.stringify({ type: "unauthorized" }));
            connection.close();
            return;
          }

          const snapshotMessage = parseSnapshotWithClientData(
            data,
            additionalAuthenticationDataValidations?.snapshot
          );
          try {
            const snapshot: Snapshot = await createSnapshot({
              snapshot: snapshotMessage,
              prevSnapshotId: snapshotMessage.lastKnownSnapshotId,
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
            addUpdate(
              documentId,
              { type: "snapshot", snapshot: snapshotMsgForOtherClients },
              connection
            );
          } catch (error) {
            if (logging === "error") {
              console.error("SNAPSHOT FAILED ERROR:", error);
            }
            if (error instanceof SecsyncSnapshotBasedOnOutdatedSnapshotError) {
              // TODO retry?
              let document = await getDocument({
                documentId,
                lastKnownSnapshotId: data.lastKnownSnapshotId,
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
                lastKnownSnapshotId: data.lastKnownSnapshotId,
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
              // log since it's an unexpected error
              if (logging === "error") {
                console.error(error);
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
          const documentAccess = await hasAccess({
            action: "write-update",
            documentId,
          });
          if (!documentAccess) {
            connection.send(JSON.stringify({ type: "unauthorized" }));
            connection.close();
            return;
          }

          const updateMessage = parseUpdate(
            data,
            additionalAuthenticationDataValidations?.update
          );
          let savedUpdate: undefined | Update = undefined;
          try {
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
            addUpdate(
              documentId,
              { ...savedUpdate, type: "update" },
              connection
            );
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
          const documentAccess = await hasAccess({
            action: "send-ephemeral-message",
            documentId,
          });
          if (!documentAccess) {
            connection.send(JSON.stringify({ type: "unauthorized" }));
            connection.close();
            return;
          }

          const ephemeralMessageMessage = parseEphemeralMessage(
            data,
            additionalAuthenticationDataValidations?.ephemeralMessage
          );
          addUpdate(
            documentId,
            { ...ephemeralMessageMessage, type: "ephemeral-message" },
            connection
          );
        }
      });

      connection.on("close", function () {
        removeConnection(documentId, connection);
      });
    } catch (error) {
      if (logging === "error") {
        console.error(error);
      }
      handleDocumentError();
    }
  };
