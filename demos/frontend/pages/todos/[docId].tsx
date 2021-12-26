import Head from "next/head";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import sodium from "libsodium-wrappers";
import * as automerge from "automerge";
import type { Doc } from "automerge";
import { v4 as uuidv4 } from "uuid";
import {
  createSnapshot,
  createUpdate,
  verifyAndDecryptSnapshot,
  verifyAndDecryptUpdate,
  createSignatureKeyPair,
  addUpdateToInProgressQueue,
  removeUpdateFromInProgressQueue,
  getUpdateInProgress,
  addSnapshotToInProgress,
  removeSnapshotInProgress,
  getSnapshotInProgress,
  addPendingUpdate,
  addPendingSnapshot,
  getPending,
  removePending,
  dispatchWebsocketState,
  getWebsocketState,
  useWebsocketState,
} from "@naisho/core";

type TodoType = {
  value: string;
  completed: boolean;
  createdAt: number;
};

type TodosDoc = Doc<{ todos: { [key: string]: TodoType } }>;

const reconnectTimeout = 2000;

const encodeChanges = (changes: Uint8Array[]) => {
  const result = JSON.stringify(
    changes.map((change) => sodium.to_base64(change))
  );
  return result;
};

const decodeChanges = (changes: Uint8Array) => {
  const parsed = JSON.parse(sodium.to_string(changes));
  const result = parsed.map((change) => sodium.from_base64(change));
  return result;
};

export default function Document() {
  const router = useRouter();
  const docId = Array.isArray(router.query.docId)
    ? router.query.docId[0]
    : router.query.docId;

  const [newTodo, setNewTodo] = React.useState("");
  const websocketConnectionRef = useRef<WebSocket>(null);
  const createSnapshotRef = useRef<boolean>(false); // only used for the UI
  const signatureKeyPairRef = useRef<sodium.KeyPair>(null);
  const activeSnapshotIdRef = useRef<string>(null);
  const latestServerVersionRef = useRef<number>(null);
  const keyRef = useRef<Uint8Array>(null);
  const docRef = useRef<TodosDoc>(null);
  const websocketState = useWebsocketState();
  const [, updateState] = React.useState({});
  const forceUpdate = React.useCallback(() => updateState({}), []);

  const change = (func) => {
    const newDoc = automerge.change(docRef.current, func);
    let changes = automerge.getChanges(docRef.current, newDoc);
    docRef.current = newDoc;
    forceUpdate();

    if (!activeSnapshotIdRef.current || createSnapshotRef.current) {
      createSnapshotRef.current = false;

      if (getSnapshotInProgress(docId) || !getWebsocketState().connected) {
        addPendingSnapshot(docId);
      } else {
        createAndSendSnapshot(newDoc, keyRef.current);
      }
    } else {
      if (getSnapshotInProgress(docId) || !getWebsocketState().connected) {
        // don't send updates when a snapshot is in progress, because they
        // must be based on the new snapshot
        addPendingUpdate(docId, changes);
      } else {
        createAndSendUpdate(changes, keyRef.current);
      }
    }
  };

  const applySnapshot = (snapshot, key) => {
    activeSnapshotIdRef.current = snapshot.publicData.snapshotId;
    const initialResult = verifyAndDecryptSnapshot(
      snapshot,
      key,
      sodium.from_base64(snapshot.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
    );
    // @ts-expect-error
    const newDoc: TodosDoc = automerge.load(initialResult);
    if (docRef.current) {
      docRef.current = automerge.merge(docRef.current, newDoc);
    } else {
      // in case the initial snapshot is loaded
      docRef.current = newDoc;
    }
    forceUpdate();
  };

  const applyUpdates = (updates, key) => {
    updates.forEach((update) => {
      console.log(
        update.serverData.version,
        update.publicData.pubKey,
        update.publicData.clock
      );
      const updateResult = verifyAndDecryptUpdate(
        update,
        key,
        sodium.from_base64(update.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
      );
      // when reconnecting the server might send already processed data updates. these then are ignored
      if (updateResult) {
        let [newDoc] = automerge.applyChanges(
          docRef.current,
          decodeChanges(updateResult)
        );
        latestServerVersionRef.current = update.serverData.version;

        docRef.current = newDoc;
        forceUpdate();
      }
    });
  };

  const createAndSendSnapshot = (newDoc, key) => {
    const docState = automerge.save(newDoc);

    const publicData = {
      snapshotId: uuidv4(),
      docId,
      pubKey: sodium.to_base64(signatureKeyPairRef.current.publicKey),
    };
    const snapshot = createSnapshot(
      docState,
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

  const createAndSendUpdate = (update, key, clockOverwrite?: number) => {
    const publicData = {
      refSnapshotId: activeSnapshotIdRef.current,
      docId,
      pubKey: sodium.to_base64(signatureKeyPairRef.current.publicKey),
    };
    const updateToSend = createUpdate(
      encodeChanges(update),
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

      const key = sodium.from_base64(window.location.hash.slice(1));
      keyRef.current = key;

      signatureKeyPairRef.current = createSignatureKeyPair();

      const onWebsocketMessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "document":
            if (data.snapshot) {
              applySnapshot(data.snapshot, key);
            } else {
              let doc: TodosDoc = automerge.init();
              const newDoc = automerge.change(doc, (doc) => {
                doc.todos = {};
              });
              docRef.current = newDoc;
            }
            applyUpdates(data.updates, key);

            // check for pending snapshots or pending updates and run them
            const pendingChanges = getPending(docId);
            if (pendingChanges.type === "snapshot") {
              createAndSendSnapshot(docRef.current, key);
              removePending(docId);
            } else if (pendingChanges.type === "updates") {
              // TODO send multiple pending.rawUpdates as one update, this requires different applying as well
              removePending(docId);
              pendingChanges.rawUpdates.forEach((rawUpdate) => {
                createAndSendUpdate(rawUpdate, key);
              });
            }
            break;
          case "snapshot":
            console.log("apply snapshot");
            const snapshotResult = verifyAndDecryptSnapshot(
              data,
              key,
              sodium.from_base64(data.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
            );
            activeSnapshotIdRef.current = data.publicData.snapshotId;
            latestServerVersionRef.current = undefined;

            // @ts-expect-error
            const snapshotDoc: TodosDoc = automerge.load(snapshotResult);
            const newDoc = automerge.merge(docRef.current, snapshotDoc);
            docRef.current = newDoc;
            forceUpdate();
            break;
          case "snapshotSaved":
            console.log("snapshot saving confirmed");
            activeSnapshotIdRef.current = data.snapshotId;
            latestServerVersionRef.current = undefined;
            removeSnapshotInProgress(data.docId);

            const pending = getPending(data.docId);
            if (pending.type === "snapshot") {
              createAndSendSnapshot(docRef.current, key);
              removePending(data.docId);
            } else if (pending.type === "updates") {
              // TODO send multiple pending.rawUpdates as one update, this requires different applying as well
              removePending(data.docId);
              pending.rawUpdates.forEach((rawUpdate) => {
                createAndSendUpdate(rawUpdate, key);
              });
            }
            break;
          case "snapshotFailed":
            console.log("snapshot saving failed", data);
            if (data.snapshot) {
              applySnapshot(data.snapshot, key);
            }
            if (data.updates) {
              applyUpdates(data.updates, key);
            }

            // TODO add a backoff after multiple failed tries

            // removed here since again added in createAndSendSnapshot
            removeSnapshotInProgress(data.docId);
            // all pending can be removed since a new snapshot will include all local changes
            removePending(data.docId);
            createAndSendSnapshot(docRef.current, key);
            break;
          case "update":
            const updateResult = verifyAndDecryptUpdate(
              data,
              key,
              sodium.from_base64(data.publicData.pubKey) // TODO check if this pubkey is part of the allowed collaborators
            );
            console.log(
              "UPDATE",
              typeof updateResult,
              decodeChanges(updateResult)
            );
            const [newDocWithUpdate] = automerge.applyChanges(
              docRef.current,
              decodeChanges(updateResult)
            );

            docRef.current = newDocWithUpdate;
            forceUpdate();
            // TODO fix it on the server
            // latestServerVersionRef.current = data.serverData.version;
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
            createAndSendUpdate(rawUpdate, key, data.clock);
            break;
        }
      };

      const setupWebsocket = () => {
        const host =
          process.env.NODE_ENV === "development"
            ? "ws://localhost:4000"
            : "wss://api.naisho.org";
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

          // retry connecting
          setTimeout(() => {
            dispatchWebsocketState({ type: "reconnecting" });
            setupWebsocket();
          }, reconnectTimeout * (1 + getWebsocketState().unsuccessfulReconnects));
        });
      };

      setupWebsocket();
    }

    initDocument();
  }, [router.isReady]);

  return (
    <>
      <Head>
        <title>Naisho</title>
        <meta name="description" content="Naisho" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Link href="/">
          <a>Home</a>
        </Link>
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

        <h1>To Dos</h1>
        {!docRef.current ? null : (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();

                change((doc) => {
                  const id = uuidv4();
                  doc.todos[id] = {
                    value: newTodo,
                    completed: false,
                    createdAt: new Date().getTime(),
                  };
                });
                setNewTodo("");
              }}
            >
              <input
                placeholder="What needs to be done?"
                onChange={(event) => setNewTodo(event.target.value)}
                value={newTodo}
              />
              <button>Add</button>
            </form>
            <ul>
              {Object.keys(docRef.current.todos)
                .map((id) => {
                  return {
                    ...docRef.current.todos[id],
                    id,
                  };
                })
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((todo) => (
                  <li key={todo.id}>
                    <input
                      onChange={(event) => {
                        change((doc) => {
                          doc.todos[todo.id].value = event.target.value;
                        });
                      }}
                      value={todo.value}
                    />
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={(event) => {
                        change((doc) => {
                          doc.todos[todo.id].completed = event.target.checked;
                        });
                      }}
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        change((doc) => {
                          delete doc.todos[todo.id];
                        });
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
