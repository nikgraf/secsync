require("make-promises-safe"); // installs an 'unhandledRejection' handler
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { createWebSocketConnection } from "secsync-server";
import { WebSocketServer } from "ws";
import { createSnapshot as createSnapshotDb } from "./database/createSnapshot";
import { createUpdate as createUpdateDb } from "./database/createUpdate";
import { getOrCreateDocument as getOrCreateDocumentDb } from "./database/getOrCreateDocument";

async function main() {
  // const allowedOrigin =
  //   process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test"
  //     ? "http://localhost:3000"
  //     : "https://www.secsync.com";
  const allowedOrigin = "*";
  const corsOptions = { credentials: true, origin: allowedOrigin };

  const app = express();
  app.use(cors(corsOptions));

  const server = createServer(app);

  const webSocketServer = new WebSocketServer({ noServer: true });
  webSocketServer.on(
    "connection",
    createWebSocketConnection({
      getDocument: getOrCreateDocumentDb,
      createSnapshot: createSnapshotDb,
      createUpdate: createUpdateDb,
      hasAccess: async () => true,
      hasBroadcastAccess: async ({ websocketSessionKeys }) =>
        websocketSessionKeys.map(() => true),
      logging: "error",
    })
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
    console.log(`🚀 Websocket service ready at ws://localhost:${port}`);
  });
}

main();
