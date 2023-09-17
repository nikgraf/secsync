type DocumentStoreEntry = {
  connections: Set<any>;
};

const documents: { [key: string]: DocumentStoreEntry } = {};

export type BroadcastMessageParams = {
  documentId: string;
  message: any;
  currentClientConnection: any;
};

export const broadcastMessage = ({
  documentId,
  message,
  currentClientConnection,
}: BroadcastMessageParams) => {
  documents[documentId]?.connections?.forEach((conn) => {
    if (currentClientConnection !== conn) {
      conn.send(JSON.stringify(message));
    }
    // for debugging purposes
    // conn.send(JSON.stringify(update));
  });
};

export type AddConnectionParams = {
  documentId: string;
  currentClientConnection: any;
};

export const addConnection = ({
  documentId,
  currentClientConnection,
}: AddConnectionParams) => {
  if (documents[documentId]) {
    documents[documentId].connections.add(currentClientConnection);
  } else {
    documents[documentId] = {
      connections: new Set<any>(),
    };
    documents[documentId].connections.add(currentClientConnection);
  }
};

export type RemoveConnectionParams = {
  documentId: string;
  currentClientConnection: any;
};

export const removeConnection = ({
  documentId,
  currentClientConnection,
}: RemoveConnectionParams) => {
  if (documents[documentId]) {
    documents[documentId].connections.delete(currentClientConnection);
  }
};
