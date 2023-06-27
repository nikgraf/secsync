import { createEphemeralUpdate } from "../ephemeralUpdate/createEphemeralUpdate";
import { SyncMachineConfig } from "../types";

export const websocketService =
  (context: SyncMachineConfig) => (send: any, onReceive: any) => {
    let connected = false;

    // timeout the connection try after 5 seconds
    setTimeout(() => {
      if (!connected) {
        send({ type: "WEBSOCKET_DISCONNECTED" });
      }
    }, 5000);

    const knownSnapshotIdParam = context.knownSnapshotInfo
      ? `&knownSnapshotId={context.knownSnapshotInfo.id}`
      : "";

    const websocketConnection = new WebSocket(
      `${context.websocketHost}/${context.documentId}?sessionKey=${context.websocketSessionKey}${knownSnapshotIdParam}`
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
        case "snapshot":
        case "snapshot-saved":
        case "snapshot-save-failed":
        case "update":
        case "update-saved":
        case "update-save-failed":
        case "ephemeral-update":
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
      console.debug("websocket error", event);
      send({ type: "WEBSOCKET_DISCONNECTED" });
    });

    websocketConnection.addEventListener("close", function (event) {
      console.debug("websocket closed");
      send({ type: "WEBSOCKET_DISCONNECTED" });
    });

    onReceive((event: any) => {
      if (event.type === "SEND") {
        websocketConnection.send(event.message);
      }
      if (event.type === "SEND_EPHEMERAL_UPDATE") {
        const prepareAndSendEphemeralUpdate = async () => {
          const publicData = {
            docId: context.documentId,
            pubKey: context.sodium.to_base64(
              context.signatureKeyPair.publicKey
            ),
          };
          const ephemeralUpdateKey = await event.getEphemeralUpdateKey();
          const ephemeralUpdate = createEphemeralUpdate(
            event.data,
            publicData,
            ephemeralUpdateKey,
            context.signatureKeyPair,
            context.sodium
          );
          console.debug("send ephemeralUpdate");
          send({
            type: "SEND",
            message: JSON.stringify(ephemeralUpdate),
            // Note: send a faulty message to test the error handling
            // message: JSON.stringify({ ...ephemeralUpdate, ciphertext: "lala" }),
          });
        };

        try {
          prepareAndSendEphemeralUpdate();
        } catch (error) {
          // TODO send a error event to the parent
          console.error(error);
        }
      }
    });

    return () => {
      console.debug("CLOSE WEBSOCKET");
      websocketConnection.close();
    };
  };
