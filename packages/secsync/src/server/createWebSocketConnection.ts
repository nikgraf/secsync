import { IncomingMessage } from "http";
import {
  SecsyncNewSnapshotRequiredError,
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
  SnapshotWithClientData,
  SnapshotWithServerData,
  UpdateWithServerData,
  parseSnapshotWithClientData,
} from "secsync";
import { WebSocket } from "ws";

import { retryAsyncFunction } from "../utils/retryAsyncFunction";
import { addConnection, addUpdate, removeConnection } from "./store";

// TODO
type SecSyncUpdate = {
  ciphertext?: string;
  nonce?: string;
  signature?: string;
  publicData?: {
    docId?: string;
    pubKey?: string;
    refSnapshotId?: string;
    clock?: number;
  };
  serverData?: { version?: number };
};

// TODO
type SecSyncSnapshot = {
  id: string; // TODO remove
  latestVersion: number; // TODO remove
};

// TODO
type SecSyncDocument = {
  doc: { id: string };
  snapshot: {};
  updates: {}[];
  snapshotProofChain: {}[];
};

type GetDocumentParams = {
  documentId: string;
  lastKnownSnapshotId?: string;
};

type CreateSnapshotParams = {
  snapshot: SnapshotWithClientData;
  activeSnapshotInfo?: {
    latestVersion: number;
    snapshotId: string;
  };
};

type CreateUpdateParams = {
  update: UpdateWithServerData;
};

type GetSnapshotAndUpdatesParams = {
  documentId: string;
  lastKnownSnapshotId?: string;
  latestServerVersion?: number;
};

type WebsocketConnectionParams = {
  getDocument(
    getDocumentParams: GetDocumentParams
  ): Promise<SecSyncDocument | undefined>;
  createSnapshot(
    createSnapshotParams: CreateSnapshotParams
  ): Promise<SecSyncSnapshot | undefined>;
  createUpdate(
    createUpdateParams: CreateUpdateParams
  ): Promise<SecSyncUpdate | undefined>;
  getSnapshotAndUpdates(
    getSnapshotAndUpdatesParams: GetSnapshotAndUpdatesParams
  ): Promise<{ snapshot: any; updates: SecSyncUpdate[] } | undefined>;
};

export const createWebSocketConnection =
  ({
    getDocument,
    createSnapshot,
    createUpdate,
    getSnapshotAndUpdates,
  }: WebsocketConnectionParams) =>
  async (connection: WebSocket, request: IncomingMessage) => {
    const documentId = request.url?.slice(1)?.split("?")[0] || "";

    // TODO allow lastKnownSnapshotId to be passed in as a query param
    const doc = await getDocument({ documentId });

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
          const snapshot = await createSnapshot({
            snapshot: snapshotMessage,
            activeSnapshotInfo,
          });
          connection.send(
            JSON.stringify({
              type: "snapshotSaved",
              snapshotId: snapshot.id,
            })
          );
          const snapshotMsgForOtherClients: SnapshotWithServerData = {
            ciphertext: snapshotMessage.ciphertext,
            nonce: snapshotMessage.nonce,
            publicData: snapshotMessage.publicData,
            signature: snapshotMessage.signature,
            serverData: {
              latestVersion: snapshot.latestVersion,
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
            let doc = await getDocument({
              documentId,
              lastKnownSnapshotId: data.lastKnownSnapshotId,
            });
            if (!doc) return; // should never be the case?
            connection.send(
              JSON.stringify({
                type: "snapshotFailed",
                snapshot: doc.snapshot,
                updates: doc.updates,
                snapshotProofChain: doc.snapshotProofChain,
              })
            );
          } else if (error instanceof SecsyncSnapshotMissesUpdatesError) {
            const result = await getSnapshotAndUpdates({
              documentId,
              lastKnownSnapshotId: data.lastKnownSnapshotId,
              latestServerVersion: data.latestServerVersion,
            });
            connection.send(
              JSON.stringify({
                type: "snapshotFailed",
                updates: result.updates,
              })
            );
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
                type: "snapshotFailed",
              })
            );
          }
        }
        // new update
      } else if (data?.publicData?.refSnapshotId) {
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
                update: data,
              }),
            [SecsyncNewSnapshotRequiredError]
          );
          if (savedUpdate === undefined) {
            throw new Error("Update could not be saved.");
          }

          connection.send(
            JSON.stringify({
              type: "updateSaved",
              snapshotId: data.publicData.refSnapshotId,
              clock: data.publicData.clock,
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
        // TODO check if user still has access to the document
        addUpdate(documentId, { ...data, type: "ephemeralUpdate" }, connection);
      }
    });

    connection.on("close", function () {
      removeConnection(documentId, connection);
    });
  };
