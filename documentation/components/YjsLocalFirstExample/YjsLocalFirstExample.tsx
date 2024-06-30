import sodium, { KeyPair } from "libsodium-wrappers";
import React, { useEffect, useRef, useState } from "react";
import { useY } from "react-yjs";
import { DevTool } from "secsync-react-devtool";
import { useYjsSync } from "secsync-react-yjs";
import * as Yjs from "yjs";
import { deserialize } from "./deserialize";
import { serialize } from "./serialize";

const websocketEndpoint =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  showDevTool: boolean;
};

export const YjsLocalFirstExample: React.FC<Props> = ({
  documentId,
  showDevTool,
}) => {
  const documentKey = sodium.from_base64(
    "MTcyipWZ6Kiibd5fATw55i9wyEU7KbdDoTE_MRgDR98"
  );
  const [newTodoText, setNewTodoText] = useState("");
  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  // load initial data from localStorage
  const [initialData] = useState(() => {
    const yDoc = new Yjs.Doc();
    // load full document
    const serializedDoc = localStorage.getItem(`doc:state:${documentId}`);
    if (serializedDoc) {
      Yjs.applyUpdateV2(yDoc, deserialize(serializedDoc));
    }

    // loads the pendingChanges from localStorage
    const pendingChanges = localStorage.getItem(`doc:pending:${documentId}`);

    return {
      yDoc,
      pendingChanges: pendingChanges ? deserialize(pendingChanges) : [],
    };
  });

  // create the yDocRef
  const yDocRef = useRef<Yjs.Doc>(initialData.yDoc);

  // update the document in localStorage after every change (could be debounced)
  useEffect(() => {
    const onUpdate = (update: any) => {
      const fullYDoc = Yjs.encodeStateAsUpdateV2(yDocRef.current);
      localStorage.setItem(`doc:state:${documentId}`, serialize(fullYDoc));
    };
    yDocRef.current.on("updateV2", onUpdate);

    return () => {
      yDocRef.current.off("updateV2", onUpdate);
    };
  }, []);

  const [state, send] = useYjsSync({
    // pass in the pending changes
    pendingChanges: initialData.pendingChanges,
    // callback to store the pending changes in
    onPendingChangesUpdated: (allChanges) => {
      localStorage.setItem(`doc:pending:${documentId}`, serialize(allChanges));
    },
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
      return snapshotUpdatesCount > 10;
    },
    isValidClient: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  const yTodos: Yjs.Array<string> = yDocRef.current.getArray("todos");
  const todos = useY(yTodos);

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
