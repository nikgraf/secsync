import { HasBroadcastAccessParams } from "secsync";
import WebSocket from "ws";

type ConnectionEntry = { websocketSessionKey: string; websocket: WebSocket };

const documents: { [key: string]: ConnectionEntry[] } = {};
const messageQueues: { [key: string]: BroadcastMessageParams[] } = {};

export type BroadcastMessageParams = {
  documentId: string;
  message: any;
  currentWebsocket: any;
  hasBroadcastAccess: (params: HasBroadcastAccessParams) => Promise<boolean[]>;
};

export const broadcastMessage = async (params: BroadcastMessageParams) => {
  const { documentId } = params;

  if (!messageQueues[documentId]) {
    messageQueues[documentId] = [];
  }

  messageQueues[documentId].push(params);

  // only start processing if this is the only message in the queue to avoid overlapping calls
  if (messageQueues[documentId].length === 1) {
    processMessageQueue(documentId);
  }
};

const processMessageQueue = async (documentId: string) => {
  if (!documents[documentId] || messageQueues[documentId].length === 0) return;

  const { hasBroadcastAccess } = messageQueues[documentId][0];

  const websocketSessionKeys = documents[documentId].map(
    ({ websocketSessionKey }) => websocketSessionKey
  );

  const accessResults = await hasBroadcastAccess({
    documentId,
    websocketSessionKeys,
  });

  documents[documentId] = documents[documentId].filter(
    (_, index) => accessResults[index]
  );

  // Send all the messages in the queue to the allowed connections
  messageQueues[documentId].forEach(({ message, currentWebsocket }) => {
    documents[documentId].forEach(({ websocket }) => {
      if (websocket !== currentWebsocket) {
        websocket.send(JSON.stringify(message));
      }
    });
  });

  // clear the message queue after it's broadcasted
  messageQueues[documentId] = [];
};

export type AddConnectionParams = {
  documentId: string;
  websocket: WebSocket;
  websocketSessionKey: string;
};

export const addConnection = ({
  documentId,
  websocket,
  websocketSessionKey,
}: AddConnectionParams) => {
  if (documents[documentId]) {
    documents[documentId].push({ websocket, websocketSessionKey });
  } else {
    documents[documentId] = [{ websocket, websocketSessionKey }];
  }
};

export type RemoveConnectionParams = {
  documentId: string;
  websocket: WebSocket;
};

export const removeConnection = ({
  documentId,
  websocket: currentWebsocket,
}: RemoveConnectionParams) => {
  if (documents[documentId]) {
    documents[documentId] = documents[documentId].filter(
      ({ websocket }) => websocket !== currentWebsocket
    );
  }
};
