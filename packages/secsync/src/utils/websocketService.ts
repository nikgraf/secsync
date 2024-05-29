import { fromCallback } from "xstate";
import { hash } from "../crypto/hash";
import {
  createEphemeralMessage,
  messageTypes,
} from "../ephemeralMessage/createEphemeralMessage";
import { parseSnapshot } from "../snapshot/parseSnapshot";
import {
  EphemeralMessagesSession,
  SnapshotUpdateClocks,
  SyncMachineConfig,
} from "../types";

export type WebsocketActorParams = {
  sendBack: any;
  receive: any;
  input: {
    context: SyncMachineConfig;
    ephemeralMessagesSession: EphemeralMessagesSession;
  };
};

export const websocketService = fromCallback(
  ({ sendBack, receive, input }: WebsocketActorParams) => {
    const { ephemeralMessagesSession, context } = input;
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
      sendBack({
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
        sendBack({ type: "WEBSOCKET_DISCONNECTED" });
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
      `${context.websocketEndpoint}/${context.documentId}?sessionKey=${
        context.websocketSessionKey
      }${modeParam}${knownSnapshotIdParam}${
        knownSnapshotUpdateClocks ? `${knownSnapshotUpdateClocks}` : ""
      }`
    );

    const onWebsocketMessage = async (event: any) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "document-not-found":
          sendBack({ type: "WEBSOCKET_DOCUMENT_NOT_FOUND" });
          break;
        case "unauthorized":
          sendBack({ type: "WEBSOCKET_UNAUTHORIZED" });
          break;
        case "document-error":
          sendBack({ type: "WEBSOCKET_DOCUMENT_ERROR" });
          break;
        case "document":
          // At this point the server will have added the user to the active session of
          // the document, so we can start sending ephemeral messages.
          // An empty ephemeralMessage right away to initiate the session signing.
          // NOTE: There is no break and send with WEBSOCKET_ADD_TO_INCOMING_QUEUE is still invoked
          try {
            const parseSnapshotResult = parseSnapshot(
              data.snapshot,
              context.additionalAuthenticationDataValidations?.snapshot
            );
            const snapshot = parseSnapshotResult.snapshot;
            const key = await context.getSnapshotKey({
              snapshotId: snapshot.publicData.snapshotId,
              parentSnapshotProof: snapshot.publicData.parentSnapshotProof,
              snapshotCiphertextHash: hash(snapshot.ciphertext, context.sodium),
              additionalPublicData: parseSnapshotResult.additionalPublicData,
            });
            prepareAndSendEphemeralMessage(
              new Uint8Array(),
              "initialize",
              key
            ).catch((reason) => {
              if (context.logging === "debug" || context.logging === "error") {
                console.error(reason);
              }
              sendBack({
                type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
                error: new Error("SECSYNC_ERROR_601"),
              });
            });
          } catch (err) {
            // can be ignored since a session will just be established later
          }
        case "snapshot":
        case "snapshot-saved":
        case "snapshot-save-failed":
        case "update":
        case "update-saved":
        case "update-save-failed":
        case "ephemeral-message":
          sendBack({ type: "WEBSOCKET_ADD_TO_INCOMING_QUEUE", data });
          break;
        default:
          sendBack({ type: "WEBSOCKET_ADD_TO_CUSTOM_MESSAGE_QUEUE", data });
      }
    };

    websocketConnection.addEventListener("message", onWebsocketMessage);

    websocketConnection.addEventListener("open", (event) => {
      connected = true;
      sendBack({ type: "WEBSOCKET_CONNECTED", websocket: websocketConnection });
    });

    websocketConnection.addEventListener("error", (event) => {
      if (context.logging === "debug") {
        console.debug("websocket error", event);
      }
      sendBack({ type: "WEBSOCKET_DISCONNECTED" });
    });

    websocketConnection.addEventListener("close", function (event) {
      if (context.logging === "debug") {
        console.debug("websocket closed");
      }
      sendBack({ type: "WEBSOCKET_DISCONNECTED" });
    });

    receive(async (event: any) => {
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
            sendBack({
              type: "FAILED_CREATING_EPHEMERAL_MESSAGE",
              error: new Error("SECSYNC_ERROR_601"),
            });
          });
        } catch (error) {
          if (context.logging === "debug" || context.logging === "error") {
            console.error(error);
          }
          sendBack({
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
  }
);
