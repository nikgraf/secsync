import {
  createEphemeralMessage,
  messageTypes,
} from "../ephemeralMessage/createEphemeralMessage";
import {
  EphemeralMessagesSession,
  SnapshotUpdateClocks,
  SyncMachineConfig,
} from "../types";

export const websocketService =
  (
    context: SyncMachineConfig,
    ephemeralMessagesSession: EphemeralMessagesSession
  ) =>
  (send: any, onReceive: any) => {
    let ephemeralSessionCounter = ephemeralMessagesSession.counter;
    const prepareAndSendEphemeralMessage = async (
      data: any,
      messageType: keyof typeof messageTypes,
      key: Uint8Array
    ) => {
      const publicData = {
        docId: context.documentId,
        pubKey: context.sodium.to_base64(context.signatureKeyPair.publicKey),
      };
      const ephemeralMessage = createEphemeralMessage(
        data,
        messageType,
        publicData,
        key,
        context.signatureKeyPair,
        ephemeralMessagesSession.id,
        ephemeralSessionCounter,
        context.sodium
      );
      ephemeralSessionCounter++;
      if (context.logging === "debug") {
        console.debug("send ephemeralMessage");
      }
      send({
        type: "SEND",
        message: JSON.stringify(ephemeralMessage),
        // Note: send a faulty message to test the error handling
        // message: JSON.stringify({ ...ephemeralMessage, ciphertext: "lala" }),
      });
    };

    let connected = false;

    // timeout the connection try after 5 seconds
    setTimeout(() => {
      if (!connected) {
        send({ type: "WEBSOCKET_DISCONNECTED" });
      }
    }, 5000);

    const knownSnapshotIdParam = context.loadDocumentParams
      ? `&knownSnapshotId=${context.loadDocumentParams.knownSnapshotInfo.snapshotId}`
      : "";

    const modeParam = context.loadDocumentParams
      ? `&mode=${context.loadDocumentParams.mode}`
      : `&mode=complete`;

    let knownSnapshotUpdateClocks = "";
    if (knownSnapshotIdParam !== "" && context.loadDocumentParams) {
      try {
        const updateClocks = SnapshotUpdateClocks.parse(
          context.loadDocumentParams.knownSnapshotInfo.updateClocks
        );
        knownSnapshotUpdateClocks = `&knownSnapshotUpdateClocks=${encodeURIComponent(
          JSON.stringify(updateClocks)
        )}`;
      } catch (err) {}
    }

    const websocketConnection = new WebSocket(
      `${context.websocketHost}/${context.documentId}?sessionKey=${
        context.websocketSessionKey
      }${modeParam}${knownSnapshotIdParam}${
        knownSnapshotUpdateClocks ? `${knownSnapshotUpdateClocks}` : ""
      }`
    );

    const onWebsocketMessage = async (event: any) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "document-not-found":
          send({ type: "WEBSOCKET_DOCUMENT_NOT_FOUND" });
          break;
        case "unauthorized":
          send({ type: "WEBSOCKET_UNAUTHORIZED" });
          break;
        case "document-error":
          send({ type: "WEBSOCKET_DOCUMENT_ERROR" });
          break;
        case "document":
          // At this point the server will have added the user to the active session of
          // the document, so we can start sending ephemeral messages.
          // An empty ephemeralMessage right away to initiate the session signing.
          // NOTE: There is no break and send with WEBSOCKET_ADD_TO_INCOMING_QUEUE is still invoked
          const key = await context.getSnapshotKey(data.snapshot);
          prepareAndSendEphemeralMessage(
            new Uint8Array(),
            "initialize",
            key
          ).catch((reason) => {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(reason);
            }
            send({
              type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
              error: new Error("SECSYNC_ERROR_601"),
            });
          });
        case "snapshot":
        case "snapshot-saved":
        case "snapshot-save-failed":
        case "update":
        case "update-saved":
        case "update-save-failed":
        case "ephemeral-message":
          send({ type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE", data });
          break;
        default:
          send({ type: "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE", data });
      }
    };

    websocketConnection.addEventListener("message", onWebsocketMessage);

    websocketConnection.addEventListener("open", (event) => {
      connected = true;
      send({ type: "WEBSOCKET_CONNECTED", websocket: websocketConnection });
    });

    websocketConnection.addEventListener("error", (event) => {
      if (context.logging === "debug") {
        console.debug("websocket error", event);
      }
      send({ type: "WEBSOCKET_DISCONNECTED" });
    });

    websocketConnection.addEventListener("close", function (event) {
      if (context.logging === "debug") {
        console.debug("websocket closed");
      }
      send({ type: "WEBSOCKET_DISCONNECTED" });
    });

    onReceive(async (event: any) => {
      if (event.type === "SEND") {
        websocketConnection.send(event.message);
      }
      if (event.type === "SEND_EPHEMERAL_MESSAGE") {
        try {
          const key = await event.getKey();
          prepareAndSendEphemeralMessage(
            event.data,
            event.messageType,
            key
          ).catch((reason) => {
            if (context.logging === "debug" || context.logging === "error") {
              console.error(reason);
            }
            send({
              type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
              error: new Error("SECSYNC_ERROR_601"),
            });
          });
        } catch (error) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(error);
          }
          send({
            type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
            error: new Error("SECSYNC_ERROR_601"),
          });
        }
      }
    });

    return () => {
      if (context.logging === "debug") {
        console.debug("CLOSE WEBSOCKET");
      }
      websocketConnection.close();
    };
  };
