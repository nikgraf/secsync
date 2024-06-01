import {
  InstancePresenceRecordType,
  TLInstancePresence,
  TLRecord,
  TLStoreWithStatus,
  computed,
  createPresenceStateDerivation,
  createTLStore,
  defaultShapeUtils,
  defaultUserPreferences,
  getUserPreferences,
  react,
  transact,
} from "@tldraw/tldraw";
import sodium, { KeyPair } from "libsodium-wrappers";
import { useEffect, useRef, useState } from "react";
import { useYjsSync } from "secsync-react-yjs";
import { YKeyValue } from "y-utility/y-keyvalue";
import * as Yjs from "yjs";
import { DEFAULT_STORE } from "./default_store";

type PrependToTuple<T extends any[], U> = [U, ...T];

function prependTLStoreWithStatus<T extends any[]>(
  tuple: T,
  store: TLStoreWithStatus
): PrependToTuple<T, TLStoreWithStatus> {
  return [store, ...tuple];
}

type Params = {
  documentId: string;
  documentKey: Uint8Array;
  websocketEndpoint: string;
};

export function useYjsSecSyncStore({
  documentId,
  documentKey,
  websocketEndpoint,
}: Params) {
  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yArr = yDocRef.current.getArray<{ key: string; val: TLRecord }>(
    `tl_${documentId}`
  );
  const yStore = new YKeyValue(yArr);

  const syncResult = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketEndpoint,
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
      // create a new snapshot if the active snapshot has more than 100 updates
      return snapshotUpdatesCount > 100;
    },
    isValidClient: async (signingPublicKey: string) => true,
    sodium,
    logging: "debug",
  });
  const [state, send, , yAwareness] = syncResult;

  const subscribers: (() => void)[] = [];

  function handleSync() {
    subscribers.push(
      store.listen(
        function syncStoreChangesToYjsDoc({ changes }) {
          yDocRef.current.transact(() => {
            Object.values(changes.added).forEach((record: any) => {
              yStore.set(record.id, record);
            });

            Object.values(changes.updated).forEach(([_, record]) => {
              yStore.set(record.id, record);
            });

            Object.values(changes.removed).forEach((record: any) => {
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
            // @ts-expect-error
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
    subscribers.push(() => yStore.off("change", handleChange));

    // awareness setup
    const userPreferences = computed<{
      id: string;
      color: string;
      name: string;
    }>("userPreferences", () => {
      const user = getUserPreferences();
      return {
        id: user.id,
        color: user.color ?? defaultUserPreferences.color,
        name: user.name ?? defaultUserPreferences.name,
      };
    });

    // Create the instance presence derivation
    const yClientId = yAwareness.clientID.toString();
    const presenceId = InstancePresenceRecordType.createId(yClientId);
    const presenceDerivation =
      createPresenceStateDerivation(userPreferences)(store);

    // Set the client's initial presence from the derivation's current value
    // @ts-expect-error
    yAwareness.setLocalStateField("presence", presenceDerivation.value);

    // When the derivation change, sync presence to to yjs awareness
    subscribers.push(
      react("when presence changes", () => {
        // @ts-expect-error
        const presence = presenceDerivation.value;
        requestAnimationFrame(() => {
          yAwareness.setLocalStateField("presence", presence);
        });
      })
    );

    // Sync yjs awareness changes to the store
    const handleUpdate = (update: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      const states = yAwareness.getStates() as Map<
        number,
        { presence: TLInstancePresence }
      >;

      const toRemove: TLInstancePresence["id"][] = [];
      const toPut: TLInstancePresence[] = [];

      // Connect records to put / remove
      for (const clientId of update.added) {
        const state = states.get(clientId);
        if (state?.presence && state.presence.id !== presenceId) {
          toPut.push(state.presence);
        }
      }

      for (const clientId of update.updated) {
        const state = states.get(clientId);
        if (state?.presence && state.presence.id !== presenceId) {
          toPut.push(state.presence);
        }
      }

      for (const clientId of update.removed) {
        toRemove.push(InstancePresenceRecordType.createId(clientId.toString()));
      }

      // put / remove the records in the store
      store.mergeRemoteChanges(() => {
        if (toRemove.length) store.remove(toRemove);
        if (toPut.length) store.put(toPut);
      });
    };

    yAwareness.on("update", handleUpdate);
    subscribers.push(() => yAwareness.off("update", handleUpdate));

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
    // @ts-expect-error
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

  return prependTLStoreWithStatus(syncResult, storeWithStatus);
}
