import { useMachine } from "@xstate/react";
import { useEffect, useState } from "react";
import {
  SyncMachineConfig,
  createSyncMachine,
  deserializeUint8ArrayUpdates,
  serializeUint8ArrayUpdates,
} from "secsync";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Yjs from "yjs";

export type YjsSyncMachineConfig = Omit<
  SyncMachineConfig,
  | "applySnapshot"
  | "applyChanges"
  | "applyEphemeralMessages"
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
        Yjs.applyUpdateV2(
          config.yDoc,
          decryptedSnapshotData,
          "sec-sync-remote"
        );
      },
      applyChanges: (decryptedChanges) => {
        decryptedChanges.map((change) => {
          Yjs.applyUpdateV2(config.yDoc, change, "sec-sync-remote");
        });
      },
      applyEphemeralMessages: (decryptedEphemeralMessages) => {
        decryptedEphemeralMessages.map((ephemeralMessage) => {
          applyAwarenessUpdate(config.yAwareness, ephemeralMessage, null);
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
    yDoc.on("updateV2", onUpdate);

    // only connect the awareness after the document loaded
    if (state.context._documentDecryptionState !== "complete") {
      return;
    }

    const onAwarenessUpdate = ({ added, updated, removed }: any) => {
      // NOTE: an endless loop of sending ephemeral messages can happen if there are
      // two prosemirror EditorViews are attached to the same DOM element
      const changedClients = added.concat(updated).concat(removed);
      const yAwarenessUpdate = encodeAwarenessUpdate(
        yAwareness,
        changedClients
      );
      send({ type: "ADD_EPHEMERAL_UPDATE", data: yAwarenessUpdate });
    };

    yAwareness.on("update", onAwarenessUpdate);

    // remove awareness state when closing the browser tab
    if (global.window) {
      global.window.addEventListener("beforeunload", () => {
        removeAwarenessStates(yAwareness, [yDoc.clientID], "window unload");
      });
    }

    return () => {
      removeAwarenessStates(yAwareness, [yDoc.clientID], "hook unmount");
      yAwareness.off("update", onAwarenessUpdate);
      yDoc.off("update", onUpdate);
    };
    // causes issues if ran multiple times e.g. awareness sharing to not work anymore
  }, [state.context._documentDecryptionState]);

  return machine;
};
