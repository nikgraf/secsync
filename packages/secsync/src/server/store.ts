type DocumentStoreEntry = {
  connections: Set<any>;
};

const documents: { [key: string]: DocumentStoreEntry } = {};

export const addUpdate = (documentId: string, update: any, connection: any) => {
  documents[documentId]?.connections?.forEach((conn) => {
    if (connection !== conn) {
      conn.send(JSON.stringify(update));
    }
    // for debugging purposes
    // conn.send(JSON.stringify(update));
  });
};

export const addConnection = (documentId: string, connection: any) => {
  if (documents[documentId]) {
    documents[documentId].connections.add(connection);
  } else {
    documents[documentId] = {
      connections: new Set<any>(),
    };
    documents[documentId].connections.add(connection);
  }
};

export const removeConnection = (documentId: string, connection: any) => {
  if (documents[documentId]) {
    documents[documentId].connections.delete(connection);
  }
};
