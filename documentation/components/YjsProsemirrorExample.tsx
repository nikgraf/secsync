import sodium, { KeyPair } from "libsodium-wrappers";
import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React, { useEffect, useRef, useState } from "react";
import { DevTool } from "secsync-react-devtool";
import { useYjsSync } from "secsync-react-yjs";
import {
  redo,
  undo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import * as Yjs from "yjs";

const websocketEndpoint =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

export const cursorBuilder = (user: { publicKey: string }) => {
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
    websocketEndpoint,
    websocketSessionKey: "your-secret-session-key",
    onDocumentUpdated: async ({ knownSnapshotInfo }) => {},
    getNewSnapshotData: async ({ id }) => {
      return {
        data: Yjs.encodeStateAsUpdateV2(yDocRef.current),
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
    isValidClient: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  const initiateEditor = () => {
    const yXmlFragment = yDocRef.current.getXmlFragment("document");

    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
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
      <div ref={editorRef}>Loading</div>
      <div className="mt-8" />
      <DevTool state={state} send={send} />
    </>
  );
};

export default YjsProsemirrorExample;
