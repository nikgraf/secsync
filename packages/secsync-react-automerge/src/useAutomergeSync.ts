import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { useMachine } from "@xstate/react";
import { useCallback, useRef, useState } from "react";
import {
  SyncMachineConfig,
  createSyncMachine,
  deserializeUint8ArrayUpdates,
  serializeUint8ArrayUpdates,
} from "secsync";

export type AutomergeSyncConfig<T> = Omit<
  SyncMachineConfig,
  | "applySnapshot"
  | "applyChanges"
  | "applyEphemeralMessage"
  | "serializeChanges"
  | "deserializeChanges"
> & {
  initialDoc: Doc<T>;
};

export type SyncDocParams<T> = {
  doc: T;
};

export const useAutomergeSync = <T>(config: AutomergeSyncConfig<T>) => {
  const { initialDoc, ...rest } = config;
  // using a ref here since in the case of syncDoc we want a new doc, but also
  // want to make sure applyChanges and access the latest version in an old
  // or new render cycle
  const docRef = useRef<Doc<T>>(initialDoc);
  const [, updateState] = useState({});
  const updateDocRefAndRender = useCallback((newDoc: Doc<T>) => {
    docRef.current = newDoc;
    updateState({});
  }, []);

  // necessary to avoid that the same machine context is re-used for different or remounted pages
  // more info here:
  //
  // How to reproduce A:
  // 1. Open a Document a
  // 2. Open a Document b
  // 3. Open Document a again
  // How to reproduce B:
  // 1. Open a Document a
  // 2. During timeout click the Reload button
  //
  // more info: https://github.com/statelyai/xstate/issues/1101
  // related: https://github.com/statelyai/xstate/discussions/1825
  const [syncMachine1] = useState(() => createSyncMachine());
  const machine = useMachine(syncMachine1, {
    input: {
      ...rest,
      applySnapshot: (decryptedSnapshotData) => {
        let newDoc: Doc<T> = Automerge.load(decryptedSnapshotData);
        if (newDoc) {
          newDoc = Automerge.merge(docRef.current, newDoc);
        }
        updateDocRefAndRender(newDoc);
      },
      applyChanges: (decryptedChanges) => {
        const [newDoc] = Automerge.applyChanges(
          docRef.current,
          decryptedChanges
        );
        updateDocRefAndRender(newDoc);
      },
      applyEphemeralMessage: (decryptedEphemeralMessage) => {},
      serializeChanges: (updates: Uint8Array[]) =>
        serializeUint8ArrayUpdates(updates, config.sodium),
      deserializeChanges: (serialized: string) =>
        deserializeUint8ArrayUpdates(serialized, config.sodium),
    },
  });

  const syncDoc = (newDoc: Doc<T>) => {
    let changes = Automerge.getChanges(docRef.current, newDoc);
    updateDocRefAndRender(newDoc);
    machine[1]({ type: "ADD_CHANGES", data: changes });
  };

  const returnValue: [Doc<T>, (newDoc: Doc<T>) => void, ...typeof machine] = [
    docRef.current,
    syncDoc,
    ...machine,
  ];
  return returnValue;
};
