import {
  TLRecord,
  TLStoreWithStatus,
  createTLStore,
  defaultShapeUtils,
  transact,
} from "@tldraw/tldraw";
import sodium, { KeyPair } from "libsodium-wrappers";
import { useEffect, useRef, useState } from "react";
import { useYjsSync } from "secsync-react-yjs";
import { YKeyValue } from "y-utility/y-keyvalue";
import * as Yjs from "yjs";
import { DEFAULT_STORE } from "./default_store";

type Params = {
  documentId: string;
  documentKey: Uint8Array;
  websocketHost: string;
};

export function useYjsSecSyncStore({
  documentId,
  documentKey,
  websocketHost,
}: Params) {
  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yArr = yDocRef.current.getArray<{ key: string; val: TLRecord }>(
    `tl_${documentId}`
  );
  const yStore = new YKeyValue(yArr);

  const [state, send, , yAwareness] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
    websocketSessionKey: "your-secret-session-key",
    onDocumentUpdated: async ({ knownSnapshotInfo }) => {},
    getNewSnapshotData: async ({ id }) => {
      return {
        data: Yjs.encodeStateAsUpdateV2(yDocRef.current),
        key: documentKey,
        publicData: {},
      };
    },
    getSnapshotKey: async (snapshot) => documentKey,
    shouldSendSnapshot: ({ snapshotUpdatesCount }) => {
      // create a new snapshot if the active snapshot has more than 10 updates
      return snapshotUpdatesCount > 10;
    },
    isValidClient: async (signingPublicKey: string) => true,
    sodium,
    logging: "debug",
  });

  const unsubs: (() => void)[] = [];

  function handleSync() {
    unsubs.push(
      store.listen(
        function syncStoreChangesToYjsDoc({ changes }) {
          yDocRef.current.transact(() => {
            Object.values(changes.added).forEach((record) => {
              yStore.set(record.id, record);
            });

            Object.values(changes.updated).forEach(([_, record]) => {
              yStore.set(record.id, record);
            });

            Object.values(changes.removed).forEach((record) => {
              yStore.delete(record.id);
            });
          }, "mobile-webview");
        },
        // Only sync document changes by a user
        { source: "user", scope: "document" }
      )
    );

    // Sync the Yjs doc changes to the store
    const handleChange = (
      changes: Map<
        string,
        | { action: "delete"; oldValue: TLRecord }
        | { action: "update"; oldValue: TLRecord; newValue: TLRecord }
        | { action: "add"; newValue: TLRecord }
      >,
      transaction: Yjs.Transaction
    ) => {
      if (transaction.local) return;

      const toRemove: TLRecord["id"][] = [];
      const toPut: TLRecord[] = [];

      changes.forEach((change, id) => {
        switch (change.action) {
          case "add":
          case "update": {
            const record = yStore.get(id)!;
            toPut.push(record);
            break;
          }
          case "delete": {
            toRemove.push(id as TLRecord["id"]);
            break;
          }
        }
      });

      // Put or remove the records in the store
      store.mergeRemoteChanges(() => {
        if (toRemove.length) store.remove(toRemove);
        if (toPut.length) store.put(toPut);
      });
    };

    yStore.on("change", handleChange);
    unsubs.push(() => yStore.off("change", handleChange));

    // Fill the store with the Yjs doc content or if empty
    // initialize the Yjs Doc with the default store records.
    if (yStore.yarray.length) {
      // Replace the store records with the Yjs doc records
      transact(() => {
        store.clear();
        const records = yStore.yarray.toJSON().map(({ val }) => val);
        store.put(records);
      });
    } else {
      // Create the initial store records and sync the store records to the Yjs doc
      yDocRef.current.transact(() => {
        for (const record of store.allRecords()) {
          yStore.set(record.id, record);
        }
      });
    }

    setStoreWithStatus({
      store,
      status: "synced-remote",
      connectionStatus: "online",
    });
  }

  const [store] = useState(() => {
    const store = createTLStore({
      shapeUtils: [...defaultShapeUtils],
    });
    store.loadSnapshot(DEFAULT_STORE);
    return store;
  });

  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: "loading",
  });

  useEffect(() => {
    setStoreWithStatus({ status: "loading" });
    handleSync();
  }, [store]);

  const prevStateValueRef = useRef<any>(state.value);
  useEffect(() => {
    if (
      !prevStateValueRef.current.hasOwnProperty("connected") &&
      state.matches("connected")
    ) {
      setStoreWithStatus({
        status: "synced-remote",
        connectionStatus: "online",
        store,
      });
    } else if (
      prevStateValueRef.current.hasOwnProperty("connected") &&
      !state.matches("connected")
    ) {
      setStoreWithStatus({
        status: "synced-remote",
        connectionStatus: "offline",
        store,
      });
    }
    prevStateValueRef.current = state.value;
  }, [state.value]);

  return storeWithStatus;
}
