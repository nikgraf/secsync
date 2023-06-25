require("make-promises-safe"); // installs an 'unhandledRejection' handler
import {
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginLandingPageGraphQLPlayground,
} from "apollo-server-core";
import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import {
  SecsyncNewSnapshotRequiredError,
  SecsyncSnapshotBasedOnOutdatedSnapshotError,
  SecsyncSnapshotMissesUpdatesError,
  SnapshotWithServerData,
  UpdateWithServerData,
  parseSnapshotWithClientData,
} from "secsync";
import { WebSocketServer } from "ws";
import { createDocument } from "./database/createDocument";
import { createSnapshot } from "./database/createSnapshot";
import { createUpdate } from "./database/createUpdate";
import { getDocument } from "./database/getDocument";
import { getUpdatesForDocument } from "./database/getUpdatesForDocument";
import { retryAsyncFunction } from "./retryAsyncFunction";
import { schema } from "./schema";
import { addConnection, addUpdate, removeConnection } from "./store";

async function main() {
  const apolloServer = new ApolloServer({
    // @ts-expect-error
    schema,
    plugins: [
      process.env.NODE_ENV === "production"
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageGraphQLPlayground(),
    ],
  });
  await apolloServer.start();

  const allowedOrigin =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
      ? "http://localhost:3000"
      : "https://www.secsync.com";
  const corsOptions = { credentials: true, origin: allowedOrigin };

  const app = express();
  app.use(cors(corsOptions));
  apolloServer.applyMiddleware({ app, cors: corsOptions });

  const server = createServer(app);

  const webSocketServer = new WebSocketServer({ noServer: true });
  webSocketServer.on(
    "connection",
    async function connection(connection, request) {
      const documentId = request.url?.slice(1)?.split("?")[0] || "";

      let doc = await getDocument(documentId);
      if (!doc) {
        // connection.send(JSON.stringify({ error: "Document not found." }));
        // TODO close connection
        // return;
        await createDocument(documentId);
        doc = await getDocument(documentId);
      }
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
              let doc = await getDocument(documentId, data.lastKnownSnapshotId);
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
              const result = await getUpdatesForDocument(
                documentId,
                data.lastKnownSnapshotId,
                data.latestServerVersion
              );
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
            addUpdate(
              documentId,
              { ...savedUpdate, type: "update" },
              connection
            );
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
          addUpdate(
            documentId,
            { ...data, type: "ephemeralUpdate" },
            connection
          );
        }
      });

      connection.on("close", function () {
        removeConnection(documentId, connection);
      });
    }
  );

  server.on("upgrade", (request, socket, head) => {
    // @ts-ignore
    webSocketServer.handleUpgrade(request, socket, head, (ws) => {
      webSocketServer.emit("connection", ws, request);
    });
  });

  const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
  server.listen(port, () => {
    console.log(`🚀 App ready at http://localhost:${port}/`);
    console.log(`🚀 GraphQL service ready at http://localhost:${port}/graphql`);
    console.log(`🚀 Websocket service ready at ws://localhost:${port}`);
  });
}

main();
