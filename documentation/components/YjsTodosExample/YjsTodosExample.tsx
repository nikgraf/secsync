import sodium, { KeyPair } from "libsodium-wrappers";
import React, { useRef, useState } from "react";
import { useYjsSync } from "secsync-react-yjs";
import * as Yjs from "yjs";
import { useYArray } from "../../hooks/useYArray";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
};

export const YjsTodosExample: React.FC<Props> = ({ documentId }) => {
  const documentKey = sodium.from_base64(
    "MTcyipWZ6Kiibd5fATw55i9wyEU7KbdDoTE_MRgDR98"
  );

  const [authorKeyPair] = useState<KeyPair>(() => {
    return sodium.crypto_sign_keypair();
  });

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yTodos: Yjs.Array<string> = yDocRef.current.getArray("todos");
  const todos = useYArray(yTodos);

  const [state, send] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
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
      // create a new snapshot if the active snapshot has more than 10 updates
      return snapshotUpdatesCount > 10;
    },
    isValidClient: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  return (
    <>
      <div>
        <button
          onClick={() => {
            const todoOptions = [
              "piano lesson",
              "spring cleaning",
              "pay taxes",
              "call mum",
            ];
            const content =
              todoOptions[Math.floor(Math.random() * todoOptions.length)];
            yTodos.push([content]);
          }}
        >
          Add generated To-Do
        </button>

        {todos.map((entry, index) => {
          return (
            <div key={`${index}-${entry}`}>
              {entry}{" "}
              <button
                onClick={() => {
                  yTodos.delete(index, 1);
                }}
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
