import type { Doc } from "@automerge/automerge";
import * as Automerge from "@automerge/automerge";
import { KeyPair, default as sodium } from "libsodium-wrappers";
import React, { useState } from "react";
import { generateId } from "secsync";
import { useAutomergeSync } from "secsync-react-automerge";
import { v4 as uuidv4 } from "uuid";

type TodoType = {
  value: string;
  completed: boolean;
  createdAt: number;
};

type Todos = { todos: { [key: string]: TodoType } };

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

const AutomergeTodosExample: React.FC<Props> = ({
  documentId,
  documentKey,
}) => {
  const [newTodo, setNewTodo] = React.useState("");
  const [initialDoc] = useState<Doc<Todos>>(() => Automerge.init());
  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  const [currentDoc, syncDoc, state, send] = useAutomergeSync<Todos>({
    initialDoc,
    documentId: documentId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
    websocketSessionKey: "your-secret-session-key",
    onSnapshotSaved: async ({ snapshotId }) => {},
    getNewSnapshotData: async () => {
      const docState = Automerge.save(currentDoc);
      const snapshotId = generateId(sodium);
      return {
        id: snapshotId,
        data: docState,
        key: documentKey,
        publicData: {},
      };
    },
    getSnapshotKey: async (snapshot) => {
      return documentKey;
    },
    shouldSendSnapshot: ({ snapshotUpdatesCount }) => {
      // create a new snapshot if the active snapshot has more than 100 updates
      return snapshotUpdatesCount > 100;
    },
    isValidClient: (signingPublicKey) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  return (
    <>
      <div>
        {state.matches("connected") && "Connected"}
        {state.matches("connecting") && "Connecting …"}
        {state.matches("disconnected") && "Disconnected"}
        {state.matches("failed") && "Error in loading or sending data"}

        <button
          disabled={!state.matches("connected")}
          onClick={() => {
            send({ type: "DISCONNECT" });
          }}
        >
          Disconnect WebSocket
        </button>
        <button
          disabled={!state.matches("disconnected")}
          onClick={() => {
            send({ type: "CONNECT" });
          }}
        >
          Connect WebSocket
        </button>
      </div>

      <br />

      <form
        onSubmit={(event) => {
          event.preventDefault();

          const newDoc: Doc<Todos> = Automerge.change(currentDoc, (doc) => {
            if (!doc.todos) doc.todos = {};
            const id = uuidv4();
            doc.todos[id] = {
              value: newTodo,
              completed: false,
              createdAt: new Date().getTime(),
            };
          });
          syncDoc(newDoc);
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
        {currentDoc.todos &&
          Object.keys(currentDoc.todos)
            .map((id) => {
              return {
                ...currentDoc.todos[id],
                id,
              };
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((todo) => (
              <li key={todo.id}>
                <input
                  onChange={(event) => {
                    const newDoc: Doc<Todos> = Automerge.change(
                      currentDoc,
                      (doc) => {
                        doc.todos[todo.id].value = event.target.value;
                      }
                    );
                    syncDoc(newDoc);
                  }}
                  value={todo.value}
                />
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={(event) => {
                    const newDoc: Doc<Todos> = Automerge.change(
                      currentDoc,
                      (doc) => {
                        doc.todos[todo.id].completed = event.target.checked;
                      }
                    );
                    syncDoc(newDoc);
                  }}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    const newDoc: Doc<Todos> = Automerge.change(
                      currentDoc,
                      (doc) => {
                        delete doc.todos[todo.id];
                      }
                    );
                    syncDoc(newDoc);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
      </ul>
    </>
  );
};

export default AutomergeTodosExample;
