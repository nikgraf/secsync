import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Yjs from "yjs";
import { createSyncMachine } from "./createSyncMachine";
import { SyncMachineConfig } from "./types";
import { deserializeUint8ArrayUpdates } from "./utils/deserializeUint8ArrayUpdates";
import { serializeUint8ArrayUpdates } from "./utils/serializeUint8ArrayUpdates";

export type YjsSyncMachineConfig = Omit<
  SyncMachineConfig,
  | "applySnapshot"
  | "applyChanges"
  | "applyEphemeralUpdates"
  | "serializeChanges"
  | "deserializeChanges"
> & {
  yDoc: Yjs.Doc;
  yAwareness: Awareness;
};

export const useYjsSync = (config: YjsSyncMachineConfig) => {
  const { yDoc, yAwareness, ...rest } = config;
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
    context: {
      ...rest,
      applySnapshot: (decryptedSnapshotData) => {
        Yjs.applyUpdate(config.yDoc, decryptedSnapshotData, "sec-sync-remote");
      },
      applyChanges: (decryptedChanges) => {
        decryptedChanges.map((change) => {
          Yjs.applyUpdate(config.yDoc, change, "sec-sync-remote");
        });
      },
      applyEphemeralUpdates: (decryptedEphemeralUpdates) => {
        decryptedEphemeralUpdates.map((ephemeralUpdate) => {
          applyAwarenessUpdate(config.yAwareness, ephemeralUpdate, null);
        });
      },
      serializeChanges: (changes: Uint8Array[]) =>
        serializeUint8ArrayUpdates(changes, config.sodium),
      deserializeChanges: (serialized: string) =>
        deserializeUint8ArrayUpdates(serialized, config.sodium),
    },
  });
  const [state, send] = machine;

  useEffect(() => {
    // always listen to updates from the document itself
    const onUpdate = (update: any, origin: any) => {
      if (origin?.key === "y-sync$" || origin === "mobile-webview") {
        send({ type: "ADD_CHANGES", data: [update] });
      }
    };
    // TODO switch to v2 updates
    yDoc.on("update", onUpdate);

    // only connect the awareness after the document loaded
    if (state.context._documentDecryptionState !== "complete") {
      return;
    }

    const onAwarenessUpdate = ({ added, updated, removed }: any) => {
      const changedClients = added.concat(updated).concat(removed);
      const yAwarenessUpdate = encodeAwarenessUpdate(
        yAwareness,
        changedClients
      );
      send({ type: "ADD_EPHEMERAL_UPDATE", data: yAwarenessUpdate });
    };

    yAwareness.on("update", onAwarenessUpdate);

    return () => {
      removeAwarenessStates(yAwareness, [yDoc.clientID], "document unmount");
      yAwareness.off("update", onAwarenessUpdate);
      yDoc.off("update", onUpdate);
    };
    // causes issues if ran multiple times e.g. awareness sharing to not work anymore
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.context._documentDecryptionState]);

  return machine;
};
