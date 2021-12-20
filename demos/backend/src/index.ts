require("make-promises-safe"); // installs an 'unhandledRejection' handler
import { ApolloServer } from "apollo-server-express";
import {
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageDisabled,
} from "apollo-server-core";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { schema } from "./schema";
import { addUpdate, addConnection, removeConnection } from "./store";
import { getDocument } from "./database/getDocument";
import { createDocument } from "./database/createDocument";
import { createSnapshot } from "./database/createSnapshot";
import { createUpdate } from "./database/createUpdate";
import { retryAsyncFunction } from "./retryAsyncFunction";

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
      : "https://www.naisho.org";
  const corsOptions = { credentials: true, origin: allowedOrigin };

  const app = express();
  app.use(cors(corsOptions));
  apolloServer.applyMiddleware({ app, cors: corsOptions });

  const server = createServer(app);

  const webSocketServer = new WebSocketServer({ noServer: true });
  webSocketServer.on(
    "connection",
    async function connection(connection, request) {
      // unique id for each client connection

      console.log("connected");

      const documentId = request.url?.slice(1)?.split("?")[0] || "";

      let doc = await getDocument(documentId);
      if (!doc) {
        // connection.send(JSON.stringify({ error: "Document not found." }));
        // TODO close connection
        // return;
        await createDocument(documentId);
        doc = await getDocument(documentId);
        console.log("created new doc");
      }
      addConnection(documentId, connection);
      console.log("send");
      connection.send(JSON.stringify({ type: "document", ...doc }));
      console.log("sent!");

      connection.on("message", async function message(messageContent) {
        const data = JSON.parse(messageContent.toString());

        if (data?.publicData?.snapshotId) {
          const snapshot = await createSnapshot(data, data.latestServerVersion);
          console.log("addUpdate snapshot");
          connection.send(
            JSON.stringify({ type: "snapshotSaved", snapshotId: snapshot.id })
          );
          addUpdate(
            documentId,
            {
              ...data,
              type: "snapshot",
              serverData: {
                latestVersion: snapshot.latestVersion,
              },
            },
            connection
          );
        } else if (data?.publicData?.refSnapshotId) {
          let savedUpdate = null;
          try {
            // const random = Math.floor(Math.random() * 10);
            // if (random < 8) {
            //   throw new Error("CUSTOM ERROR");
            // }

            savedUpdate = await retryAsyncFunction(() => createUpdate(data));

            connection.send(
              JSON.stringify({
                type: "updateSaved",
                docId: data.publicData.docId,
                snapshotId: data.publicData.refSnapshotId,
                clock: data.publicData.clock,
                serverVersion: savedUpdate.version,
              })
            );
            console.log("addUpdate update");
            addUpdate(documentId, { ...data, type: "update" }, connection);
          } catch (err) {
            if (savedUpdate === null) {
              connection.send(
                JSON.stringify({
                  type: "updateFailed",
                  docId: data.publicData.docId,
                  snapshotId: data.publicData.refSnapshotId,
                  clock: data.publicData.clock,
                })
              );
            }
          }
        } else {
          console.log("addUpdate awarenessUpdate");
          addUpdate(
            documentId,
            { ...data, type: "awarenessUpdate" },
            connection
          );
        }
      });

      connection.on("close", function () {
        console.log("close connection");
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
