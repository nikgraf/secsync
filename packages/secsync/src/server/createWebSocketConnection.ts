import { IncomingMessage } from "http";
import {
  CreateSnapshotParams,
  CreateUpdateParams,
  GetDocumentParams,
  SecsyncNewSnapshotRequiredError,
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
  SnapshotWithServerData,
  UpdateWithServerData,
  parseSnapshotWithClientData,
} from "secsync";
import { URL } from "url";
import { WebSocket } from "ws";
import { parseEphemeralUpdate } from "../ephemeralUpdate/parseEphemeralUpdate";
import { parseUpdate } from "../update/parseUpdate";
import { retryAsyncFunction } from "../utils/retryAsyncFunction";
import { addConnection, addUpdate, removeConnection } from "./store";

type GetDocumentResult = {
  snapshot: SnapshotWithServerData;
  updates: UpdateWithServerData[];
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
  createSnapshot(
    createSnapshotParams: CreateSnapshotParams
  ): Promise<SnapshotWithServerData>;
  createUpdate(
    createUpdateParams: CreateUpdateParams
  ): Promise<UpdateWithServerData>;
};

function extractQueryParam(url: string, param: string): string | null {
  const urlObject = new URL(url);
  return urlObject.searchParams.get(param);
}

export const createWebSocketConnection =
  ({ getDocument, createSnapshot, createUpdate }: WebsocketConnectionParams) =>
  async (connection: WebSocket, request: IncomingMessage) => {
    const url = request.url;
    if (url === undefined) {
      connection.close();
      return;
    }
    const documentId = request.url?.slice(1)?.split("?")[0] || "";
    const lastKnownSnapshotId = extractQueryParam(url, "lastKnownSnapshotId");
    const latestServerVersion = extractQueryParam(url, "latestServerVersion");

    const doc = await getDocument({
      documentId,
      lastKnownSnapshotId: lastKnownSnapshotId
        ? lastKnownSnapshotId
        : undefined,
      lastKnownUpdateServerVersion: latestServerVersion
        ? parseInt(latestServerVersion, 10)
        : undefined,
    });

    addConnection(documentId, connection);
    connection.send(JSON.stringify({ type: "document", ...doc }));

    connection.on("message", async function message(messageContent) {
      const data = JSON.parse(messageContent.toString());

      // new snapshot
      if (data?.publicData?.snapshotId) {
        const snapshotMessage = parseSnapshotWithClientData(data);
        try {
          const activeSnapshotInfo =
            snapshotMessage.lastKnownSnapshotId &&
            snapshotMessage.latestServerVersion
              ? {
                  latestVersion: snapshotMessage.latestServerVersion,
                  snapshotId: snapshotMessage.lastKnownSnapshotId,
                }
              : undefined;
          const snapshot: SnapshotWithServerData = await createSnapshot({
            snapshot: snapshotMessage,
            activeSnapshotInfo,
          });
          connection.send(
            JSON.stringify({
              type: "snapshotSaved",
              snapshotId: snapshot.publicData.snapshotId,
            })
          );
          const snapshotMsgForOtherClients: SnapshotWithServerData = {
            ciphertext: snapshotMessage.ciphertext,
            nonce: snapshotMessage.nonce,
            publicData: snapshotMessage.publicData,
            signature: snapshotMessage.signature,
            serverData: {
              latestVersion: snapshot.serverData.latestVersion,
            },
          };
          addUpdate(
            documentId,
            { type: "snapshot", snapshot: snapshotMsgForOtherClients },
            connection
          );
        } catch (error) {
          console.error("SNAPSHOT FAILED ERROR:", error);
          if (error instanceof SecsyncSnapshotBasedOnOutdatedSnapshotError) {
            let document = await getDocument({
              documentId,
              lastKnownSnapshotId: data.lastKnownSnapshotId,
            });
            if (document) {
              connection.send(
                JSON.stringify({
                  type: "snapshotFailed",
                  snapshot: document.snapshot,
                  updates: document.updates,
                  snapshotProofChain: document.snapshotProofChain,
                })
              );
            } else {
              console.error(
                'document not found for "snapshotBasedOnOutdatedSnapshot" error'
              );
              connection.send(
                JSON.stringify({
                  type: "snapshotFailedDueBrokenDocument",
                })
              );
            }
          } else if (error instanceof SecsyncSnapshotMissesUpdatesError) {
            const document = await getDocument({
              documentId,
              lastKnownSnapshotId: data.lastKnownSnapshotId,
              lastKnownUpdateServerVersion: data.latestServerVersion,
            });
            if (document) {
              connection.send(
                JSON.stringify({
                  type: "snapshotFailed",
                  updates: document.updates,
                })
              );
            } else {
              // log since it's an unexpected error
              console.error(
                'document not found for "snapshotMissesUpdates" error'
              );
              connection.send(
                JSON.stringify({
                  type: "snapshotFailedDueBrokenDocument",
                })
              );
            }
          } else if (error instanceof SecsyncNewSnapshotRequiredError) {
            connection.send(
              JSON.stringify({
                type: "snapshotFailed",
              })
            );
          } else {
            // log since it's an unexpected error
            console.error(error);
            connection.send(
              JSON.stringify({
                type: "snapshotFailedDueBrokenDocument",
              })
            );
          }
        }
        // new update
      } else if (data?.publicData?.refSnapshotId) {
        const updateMessage = parseUpdate(data);
        let savedUpdate: undefined | UpdateWithServerData = undefined;
        try {
          // const random = Math.floor(Math.random() * 10);
          // if (random < 8) {
          //   throw new Error("CUSTOM ERROR");
          // }

          // TODO add a smart queue to create an offset based on the version?
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
              type: "updateSaved",
              snapshotId: savedUpdate.publicData.refSnapshotId,
              clock: savedUpdate.publicData.clock,
              serverVersion: savedUpdate.serverData.version,
            })
          );
          addUpdate(documentId, { ...savedUpdate, type: "update" }, connection);
        } catch (err) {
          console.error("update failed", err);
          if (savedUpdate === null || savedUpdate === undefined) {
            connection.send(
              JSON.stringify({
                type: "updateFailed",
                snapshotId: data.publicData.refSnapshotId,
                clock: data.publicData.clock,
                requiresNewSnapshot:
                  err instanceof SecsyncNewSnapshotRequiredError,
              })
            );
          }
        }
        // new ephemeral update
      } else {
        const ephemeralUpdateMessage = parseEphemeralUpdate(data);
        // TODO check if user still has access to the document
        addUpdate(
          documentId,
          { ...ephemeralUpdateMessage, type: "ephemeralUpdate" },
          connection
        );
      }
    });

    connection.on("close", function () {
      removeConnection(documentId, connection);
    });
  };
