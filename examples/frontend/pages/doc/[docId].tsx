import sodium, { KeyPair } from "libsodium-wrappers";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import React, { useEffect, useRef, useState } from "react";
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

const Document: React.FC<{ docId: string }> = ({ docId }) => {
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

  const documentKey = sodium.from_base64(window.location.hash.slice(1));

  const editorRef = useRef<HTMLDivElement>(null);
  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());

  const [state, send, , yAwareness] = useYjsSync({
    yDoc: yDocRef.current,
    documentId: docId,
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

    editorRef.current.innerHTML = "";
    let state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(yAwareness),
        yUndoPlugin(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
      ].concat(exampleSetup({ schema })),
    });

    new EditorView(editorRef.current, { state });
  };

  return (
    <>
      <Head>
        <title>Secsync</title>
        <meta name="description" content="Secsync" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Link href="/">Home</Link>
        <h2>Instructions</h2>
        <ul>
          <li>
            Any change that you make will be encrypted and uploaded to the
            server.
          </li>
          <li>
            You can refresh the page and the current state will be
            reconstructed.
          </li>
          <li>
            You can share the current URL and collaborate real-time with others.
            When doing so you can see the cursor position of every collaborator.
          </li>
        </ul>
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
        <div ref={editorRef}>Loading</div>
      </main>
    </>
  );
};

const DocumentPage: React.FC = () => {
  const router = useRouter();
  const [libsodiumIsReady, setLibsodiumIsReady] = useState(false);

  useEffect(() => {
    sodium.ready.then(() => {
      setLibsodiumIsReady(true);
    });
  }, []);

  const docId = Array.isArray(router.query.docId)
    ? router.query.docId[0]
    : router.query.docId;

  if (typeof window === "undefined" || !libsodiumIsReady || !router.isReady)
    return null;

  return <Document docId={docId} />;
};

export default DocumentPage;
