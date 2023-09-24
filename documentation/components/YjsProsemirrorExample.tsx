import sodium, { KeyPair } from "libsodium-wrappers";
import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React, { useEffect, useRef, useState } from "react";
import { generateId } from "secsync";
import { useYjsSync } from "secsync-react-yjs";
import {
  redo,
  undo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import * as Yjs from "yjs";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

export const cursorBuilder = (user) => {
  const cursor = document.createElement("span");
  cursor.classList.add("ProseMirror-yjs-cursor");
  cursor.setAttribute("style", `border-color: #444`);
  const userDiv = document.createElement("div");
  userDiv.setAttribute("style", `background-color: #444;`);
  userDiv.insertBefore(
    document.createTextNode(`Client PublicKey: ${user.publicKey}`),
    null
  );
  cursor.insertBefore(userDiv, null);
  return cursor;
};

const YjsProsemirrorExample: React.FC<Props> = ({
  documentId,
  documentKey,
}) => {
  const [authorKeyPair] = useState<KeyPair>(() => {
    // return {
    //   privateKey: sodium.from_base64(
    //     "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    //   ),
    //   publicKey: sodium.from_base64(
    //     "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    //   ),
    //   keyType: "ed25519",
    // };
    return sodium.crypto_sign_keypair();
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());

  const [state, send, , yAwareness] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
    websocketSessionKey: "your-secret-session-key",
    onDocumentUpdated: async ({ knownSnapshotInfo }) => {},
    getNewSnapshotData: async () => {
      const snapshotId = generateId(sodium);
      return {
        id: snapshotId,
        data: Yjs.encodeStateAsUpdateV2(yDocRef.current),
        key: documentKey,
        publicData: {},
      };
    },
    getSnapshotKey: async (snapshot) => {
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

  const initiateEditor = () => {
    const yXmlFragment = yDocRef.current.getXmlFragment("document");

    editorRef.current.innerHTML = "";
    let state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(yAwareness, { cursorBuilder }),
        yUndoPlugin(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
      ].concat(exampleSetup({ schema })),
    });

    return new EditorView(editorRef.current, { state });
  };

  useEffect(() => {
    const editorView = initiateEditor();

    return () => {
      editorView.destroy();
    };
  }, []);

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
      <div ref={editorRef} className="border border-primary-200 p-2 rounded">
        Loading
      </div>
    </>
  );
};

export default YjsProsemirrorExample;
