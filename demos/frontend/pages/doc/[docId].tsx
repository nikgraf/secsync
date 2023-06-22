import {
  addPendingSnapshot,
  addPendingUpdate,
  addSnapshotToInProgress,
  addUpdateToInProgressQueue,
  cleanupUpdates,
  createAwarenessUpdate,
  createSignatureKeyPair,
  createSnapshot,
  createUpdate,
  dispatchWebsocketState,
  getPending,
  getSnapshotInProgress,
  getUpdateInProgress,
  getWebsocketState,
  removePending,
  removeSnapshotInProgress,
  removeUpdateFromInProgressQueue,
  useWebsocketState,
  verifyAndDecryptAwarenessUpdate,
  verifyAndDecryptSnapshot,
  verifyAndDecryptUpdate,
} from "@naisho/core";
import sodium, { KeyPair } from "@naisho/libsodium";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  redo,
  undo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as Yjs from "yjs";
import { schema } from "../../editor/schema";

const reconnectTimeout = 2000;

export default function Document() {
  const router = useRouter();
  const docId = Array.isArray(router.query.docId)
    ? router.query.docId[0]
    : router.query.docId;
  const editorRef = useRef<HTMLDivElement>(null);
  const activeSnapshotIdRef = useRef<string>(null);
  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yAwarenessRef = useRef<Awareness>(new Awareness(yDocRef.current));
  const websocketConnectionRef = useRef<WebSocket>(null);
  const shouldReconnectWebsocketConnectionRef = useRef(true);
  const createSnapshotRef = useRef<boolean>(false); // only used for the UI
  const signatureKeyPairRef = useRef<KeyPair>(null);
  const latestServerVersionRef = useRef<number>(null);
  const editorInitializedRef = useRef<boolean>(false);
  const websocketState = useWebsocketState();

  const initiateEditor = () => {
    const yXmlFragment = yDocRef.current.getXmlFragment("document");

    editorRef.current.innerHTML = "";
    const editor = editorRef.current;
    new EditorView(editor, {
      state: EditorState.create({
        schema,
        plugins: [
          ySyncPlugin(yXmlFragment),
          yCursorPlugin(yAwarenessRef.current),
          yUndoPlugin(),
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
          }),
        ].concat(exampleSetup({ schema })),
      }),
    });
  };

  const applySnapshot = async (snapshot, key) => {
    activeSnapshotIdRef.current = snapshot.publicData.snapshotId;
    const initialResult = await verifyAndDecryptSnapshot(
      snapshot,
      key,
      sodium.from_base64(snapshot.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
    );
    if (initialResult) {
      Yjs.applyUpdate(
        yDocRef.current,
        sodium.from_base64(initialResult),
        "naisho-remote"
      );
      console.log("YJS Snapshot", yDocRef.current.get("page").toString());
    }
  };

  const applyUpdates = async (updates, key) => {
    await Promise.all(
      updates.map(async (update) => {
        console.log(
          update.serverData.version,
          update.publicData.pubKey,
          update.publicData.clock
        );
        const updateResult = await verifyAndDecryptUpdate(
          update,
          key,
          sodium.from_base64(update.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
        );
        // when reconnecting the server might send already processed data updates. these then are ignored
        if (updateResult) {
          Yjs.applyUpdate(
            yDocRef.current,
            sodium.from_base64(updateResult),
            "naisho-remote"
          );
          latestServerVersionRef.current = update.serverData.version;
        }
      })
    );
  };

  const createAndSendSnapshot = async (key) => {
    const yDocState = Yjs.encodeStateAsUpdate(yDocRef.current);
    const publicData = {
      snapshotId: uuidv4(),
      docId,
      pubKey: sodium.to_base64(signatureKeyPairRef.current.publicKey),
    };
    const snapshot = await createSnapshot(
      yDocState,
      publicData,
      key,
      signatureKeyPairRef.current
    );

    addSnapshotToInProgress(snapshot);

    websocketConnectionRef.current.send(
      JSON.stringify({
        ...snapshot,
        lastKnownSnapshotId: activeSnapshotIdRef.current,
        latestServerVersion: latestServerVersionRef.current,
      })
    );
  };

  const createAndSendUpdate = async (update, key, clockOverwrite?: number) => {
    console.log("createAndSendUpdate");
    const publicData = {
      refSnapshotId: activeSnapshotIdRef.current,
      docId,
      pubKey: sodium.to_base64(signatureKeyPairRef.current.publicKey),
    };
    const updateToSend = await createUpdate(
      update,
      publicData,
      key,
      signatureKeyPairRef.current,
      clockOverwrite
    );

    if (clockOverwrite === undefined) {
      addUpdateToInProgressQueue(updateToSend, update);
    }
    websocketConnectionRef.current.send(JSON.stringify(updateToSend));
  };

  useEffect(() => {
    if (!router.isReady) return;

    async function initDocument() {
      await sodium.ready;

      yAwarenessRef.current.setLocalStateField("user", {
        name: `User ${yDocRef.current.clientID}`,
      });

      const key = sodium.from_base64(window.location.hash.slice(1));

      signatureKeyPairRef.current = await createSignatureKeyPair();

      const onWebsocketMessage = async (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "documentNotFound":
            // TODO stop reconnecting
            break;
          case "document":
            if (data.snapshot) {
              await applySnapshot(data.snapshot, key);
            }
            await applyUpdates(data.updates, key);
            if (editorInitializedRef.current === false) {
              initiateEditor();
              editorInitializedRef.current = true;
            }

            // check for pending snapshots or pending updates and run them
            const pendingChanges = getPending(docId);
            if (pendingChanges.type === "snapshot") {
              await createAndSendSnapshot(key);
              removePending(docId);
            } else if (pendingChanges.type === "updates") {
              // TODO send multiple pending.rawUpdates as one update, this requires different applying as well
              removePending(docId);
              pendingChanges.rawUpdates.forEach(async (rawUpdate) => {
                await createAndSendUpdate(rawUpdate, key);
              });
            }
            break;
          case "snapshot":
            console.log("apply snapshot");
            const snapshotResult = await verifyAndDecryptSnapshot(
              data,
              key,
              sodium.from_base64(data.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
            );
            activeSnapshotIdRef.current = data.publicData.snapshotId;
            latestServerVersionRef.current = undefined;
            Yjs.applyUpdate(
              yDocRef.current,
              sodium.from_base64(snapshotResult),
              "naisho-remote"
            );
            break;
          case "snapshotSaved":
            console.log("snapshot saving confirmed");
            activeSnapshotIdRef.current = data.snapshotId;
            latestServerVersionRef.current = undefined;
            removeSnapshotInProgress(data.docId);

            const pending = getPending(data.docId);
            if (pending.type === "snapshot") {
              await createAndSendSnapshot(key);
              removePending(data.docId);
            } else if (pending.type === "updates") {
              // TODO send multiple pending.rawUpdates as one update, this requires different applying as well
              removePending(data.docId);
              pending.rawUpdates.forEach(async (rawUpdate) => {
                await createAndSendUpdate(rawUpdate, key);
              });
            }
            break;
          case "snapshotFailed":
            console.log("snapshot saving failed", data);
            if (data.snapshot) {
              await applySnapshot(data.snapshot, key);
            }
            if (data.updates) {
              await applyUpdates(data.updates, key);
            }

            // TODO add a backoff after multiple failed tries

            // removed here since again added in createAndSendSnapshot
            removeSnapshotInProgress(data.docId);
            // all pending can be removed since a new snapshot will include all local changes
            removePending(data.docId);
            await createAndSendSnapshot(key);
            break;
          case "update":
            const updateResult = await verifyAndDecryptUpdate(
              data,
              key,
              sodium.from_base64(data.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
            );
            Yjs.applyUpdate(
              yDocRef.current,
              sodium.from_base64(updateResult),
              "naisho-remote"
            );
            latestServerVersionRef.current = data.serverData.version;
            break;
          case "updateSaved":
            console.log("update saving confirmed", data.snapshotId, data.clock);
            latestServerVersionRef.current = data.serverVersion;
            removeUpdateFromInProgressQueue(
              data.docId,
              data.snapshotId,
              data.clock
            );
            break;
          case "updateFailed":
            console.log("update saving failed", data.snapshotId, data.clock);
            // TODO retry with an increasing offset instead of just trying again
            const rawUpdate = getUpdateInProgress(
              data.docId,
              data.snapshotId,
              data.clock
            );
            await createAndSendUpdate(rawUpdate, key, data.clock);
            break;
          case "awarenessUpdate":
            const awarenessUpdateResult = await verifyAndDecryptAwarenessUpdate(
              data,
              key,
              sodium.from_base64(data.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
            );
            console.log("awarenessUpdate");
            applyAwarenessUpdate(
              yAwarenessRef.current,
              sodium.from_base64(awarenessUpdateResult),
              null
            );
            break;
        }
      };

      const setupWebsocket = () => {
        const host =
          process.env.NODE_ENV === "development"
            ? "ws://localhost:4000"
            : "wss://naisho.fly.dev";
        const connection = new WebSocket(`${host}/${docId}`);
        websocketConnectionRef.current = connection;

        // Listen for messages
        connection.addEventListener("message", onWebsocketMessage);

        connection.addEventListener("open", function (event) {
          console.log("connection opened");
          dispatchWebsocketState({ type: "connected" });
        });

        connection.addEventListener("close", function (event) {
          console.log("connection closed");
          dispatchWebsocketState({ type: "disconnected" });
          // remove the awareness states of everyone else
          removeAwarenessStates(
            yAwarenessRef.current,
            Array.from(yAwarenessRef.current.getStates().keys()).filter(
              (client) => client !== yDocRef.current.clientID
            ),
            "TODOprovider"
          );

          // retry connecting
          if (shouldReconnectWebsocketConnectionRef.current) {
            setTimeout(() => {
              dispatchWebsocketState({ type: "reconnecting" });
              setupWebsocket();
            }, reconnectTimeout * (1 + getWebsocketState().unsuccessfulReconnects));
          }
        });
      };

      setupWebsocket();

      // remove awareness state when closing the window
      window.addEventListener("beforeunload", () => {
        removeAwarenessStates(
          yAwarenessRef.current,
          [yDocRef.current.clientID],
          "window unload"
        );
      });

      yAwarenessRef.current.on(
        "update",
        async ({ added, updated, removed }) => {
          if (!getWebsocketState().connected) {
            return;
          }

          const changedClients = added.concat(updated).concat(removed);
          const yAwarenessUpdate = encodeAwarenessUpdate(
            yAwarenessRef.current,
            changedClients
          );
          const publicData = {
            docId,
            pubKey: sodium.to_base64(signatureKeyPairRef.current.publicKey),
          };
          const awarenessUpdate = await createAwarenessUpdate(
            yAwarenessUpdate,
            publicData,
            key,
            signatureKeyPairRef.current
          );
          console.log("send awarenessUpdate");
          websocketConnectionRef.current.send(JSON.stringify(awarenessUpdate));
        }
      );

      // TODO switch to v2 updates
      yDocRef.current.on("update", async (update, origin) => {
        if (origin?.key === "y-sync$") {
          if (!activeSnapshotIdRef.current || createSnapshotRef.current) {
            createSnapshotRef.current = false;

            if (
              getSnapshotInProgress(docId) ||
              !getWebsocketState().connected
            ) {
              addPendingSnapshot(docId);
            } else {
              await createAndSendSnapshot(key);
            }
          } else {
            if (
              getSnapshotInProgress(docId) ||
              !getWebsocketState().connected
            ) {
              // don't send updates when a snapshot is in progress, because they
              // must be based on the new snapshot
              addPendingUpdate(docId, update);
            } else {
              await createAndSendUpdate(update, key);
            }
          }
        }
      });
    }

    initDocument();

    return () => {
      removeAwarenessStates(
        yAwarenessRef.current,
        [yDocRef.current.clientID],
        "document unmount"
      );
      cleanupUpdates();
      shouldReconnectWebsocketConnectionRef.current = false;
      websocketConnectionRef.current?.close();
    };
  }, [router.isReady]);

  return (
    <>
      <Head>
        <title>SecSync</title>
        <meta name="description" content="SecSync" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Link href="/">
          <a>Home</a>
        </Link>
        <h2>Instructions</h2>
        <ul>
          <li>
            Any change that you make will be encrypted and uploaded to the
            server.
          </li>
          <li>
            You can refresh the page and the current state will be
            reconstructred.
          </li>
          <li>
            You can share the current URL and collaborate real-time with others.
            When doing so you can see the cursor position of every collaborator.
          </li>
        </ul>
        <div>{websocketState.connected ? "Connected" : "Disconnected"}</div>
        <button
          type="button"
          onClick={() => {
            websocketConnectionRef.current.close();
          }}
        >
          Disconnect and reconnect
        </button>
        <button
          type="button"
          onClick={() => {
            createSnapshotRef.current = true;
          }}
        >
          Next doc change to create a snapshot
        </button>
        <button
          type="button"
          onClick={() => {
            signatureKeyPairRef.current = {
              privateKey: sodium.from_base64(
                "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
              ),
              publicKey: sodium.from_base64(
                "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
              ),
              keyType: "ed25519",
            };
          }}
        >
          Switch to user 1
        </button>
        <div ref={editorRef}>Loading</div>
      </main>
    </>
  );
}
