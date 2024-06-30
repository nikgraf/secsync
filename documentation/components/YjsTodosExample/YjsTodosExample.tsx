import sodium, { KeyPair } from "libsodium-wrappers";
import React, { useRef, useState } from "react";
import { useY } from "react-yjs";
import { DevTool } from "secsync-react-devtool";
import { useYjsSync } from "secsync-react-yjs";
import * as Yjs from "yjs";

const websocketEndpoint =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  showDevTool: boolean;
};

export const YjsTodosExample: React.FC<Props> = ({
  documentId,
  showDevTool,
}) => {
  const documentKey = sodium.from_base64(
    "MTcyipWZ6Kiibd5fATw55i9wyEU7KbdDoTE_MRgDR98"
  );

  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yTodos: Yjs.Array<string> = yDocRef.current.getArray("todos");
  const todos = useY(yTodos);
  const [newTodoText, setNewTodoText] = useState("");

  const [state, send] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketEndpoint,
    websocketSessionKey: "your-secret-session-key",
    getNewSnapshotData: async ({ id }) => {
      return {
        data: Yjs.encodeStateAsUpdateV2(yDocRef.current),
        key: documentKey,
        publicData: {},
      };
    },
    getSnapshotKey: async () => {
      return documentKey;
    },
    shouldSendSnapshot: ({ snapshotUpdatesCount }) => {
      // create a new snapshot if the active snapshot has more than 100 updates
      return snapshotUpdatesCount > 100;
    },
    isValidClient: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  return (
    <>
      <div className="todoapp">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            yTodos.push([newTodoText]);
            setNewTodoText("");
          }}
        >
          <input
            placeholder="What needs to be done?"
            onChange={(event) => setNewTodoText(event.target.value)}
            value={newTodoText}
            className="new-todo"
          />
          <button className="add">Add</button>
        </form>

        <ul className="todo-list">
          {todos.map((entry, index) => {
            return (
              <li key={`${index}-${entry}`}>
                <div className="edit">{entry}</div>
                <button
                  className="destroy"
                  onClick={() => {
                    yTodos.delete(index, 1);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-8" />
      <DevTool state={state} send={send} />
    </>
  );
};
