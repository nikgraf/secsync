import { useMachine } from "@xstate/react";
import * as decoding from "lib0/decoding";
import { useEffect, useRef, useState } from "react";
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
  | "applyEphemeralMessage"
  | "serializeChanges"
  | "deserializeChanges"
> & {
  yDoc: Yjs.Doc;
};

type AppendToTuple<T extends any[], U> = [...T, U];

function appendAwareness<T extends any[]>(
  tuple: T,
  awareness: Awareness
): AppendToTuple<T, Awareness> {
  return [...tuple, awareness];
}

export const useYjsSync = (config: YjsSyncMachineConfig) => {
  const { yDoc, ...rest } = config;

  const yAwarenessRef = useRef<Awareness>(new Awareness(yDoc));
  useState(() => {
    yAwarenessRef.current.setLocalStateField("user", {
      publicKey: config.sodium.to_base64(config.signatureKeyPair.publicKey),
    });
  });

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
        Yjs.applyUpdateV2(config.yDoc, decryptedSnapshotData, "secsync-remote");
      },
      applyChanges: (decryptedChanges) => {
        decryptedChanges.map((change) => {
          Yjs.applyUpdateV2(config.yDoc, change, "secsync-remote");
        });
      },
      applyEphemeralMessage: (ephemeralMessage, authorClientPublicKey) => {
        const decoder = decoding.createDecoder(ephemeralMessage);
        const len = decoding.readVarUint(decoder);
        let clientMatches = true;
        for (let i = 0; i < len; i++) {
          decoding.readVarUint(decoder); // clientId
          decoding.readVarUint(decoder); // clock
          const state = JSON.parse(decoding.readVarString(decoder));
          if (authorClientPublicKey !== state.user.publicKey) {
            clientMatches = false;
          }
        }

        if (clientMatches) {
          applyAwarenessUpdate(yAwarenessRef.current, ephemeralMessage, null);
        }
      },
      serializeChanges: (changes: Uint8Array[]) =>
        serializeUint8ArrayUpdates(changes, config.sodium),
      deserializeChanges: (serialized: string) =>
        deserializeUint8ArrayUpdates(serialized, config.sodium),
    },
  });
  const [snapshot, send] = machine;

  useEffect(() => {
    // always listen to updates from the document itself
    const onUpdate = (update: any, origin: any) => {
      if (origin !== "secsync-remote") {
        send({ type: "ADD_CHANGES", data: [update] });
      }
    };
    yDoc.on("updateV2", onUpdate);

    // only connect the awareness after the document loaded
    if (snapshot.context._documentDecryptionState !== "complete") {
      return () => {
        yDoc.off("updateV2", onUpdate);
      };
    }

    const onAwarenessUpdate = ({ added, updated, removed }: any) => {
      // NOTE: an endless loop of sending ephemeral messages can happen if there are
      // two prosemirror EditorViews are attached to the same DOM element
      const changedClients = added.concat(updated).concat(removed);
      const yAwarenessUpdate = encodeAwarenessUpdate(
        yAwarenessRef.current,
        changedClients
      );
      send({ type: "ADD_EPHEMERAL_MESSAGE", data: yAwarenessUpdate });
    };

    yAwarenessRef.current.on("update", onAwarenessUpdate);

    // remove awareness state when closing the browser tab

    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("beforeunload", () => {
        removeAwarenessStates(
          yAwarenessRef.current,
          [yDoc.clientID],
          "window unload"
        );
      });
    }

    return () => {
      removeAwarenessStates(
        yAwarenessRef.current,
        [yDoc.clientID],
        "hook unmount"
      );
      yAwarenessRef.current.off("update", onAwarenessUpdate);
      yDoc.off("updateV2", onUpdate);
    };
    // causes issues if ran multiple times e.g. awareness sharing to not work anymore
  }, [snapshot.context._documentDecryptionState]);

  return appendAwareness(machine, yAwarenessRef.current);
};
