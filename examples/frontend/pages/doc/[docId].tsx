import sodium, { KeyPair } from "libsodium-wrappers";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { exampleSetup } from "prosemirror-example-setup";
import { keymap } from "prosemirror-keymap";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { useEffect, useRef, useState } from "react";
import { generateId } from "secsync";
import { useYjsSync } from "secsync-react-yjs";
import {
  redo,
  undo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "y-prosemirror";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import * as Yjs from "yjs";
import { schema } from "../../editor/schema";

const websocketHost =
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
  const yAwarenessRef = useRef<Awareness>(new Awareness(yDocRef.current));

  const [state, send] = useYjsSync({
    yDoc: yDocRef.current,
    yAwareness: yAwarenessRef.current,
    documentId: docId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
    websocketSessionKey: "your-secret-session-key",
    onSnapshotSaved: async () => {
      // snapshotKeyRef.current = snapshotInFlightKeyRef.current;
      // snapshotInFlightKeyRef.current = null;
    },
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
    getUpdateKey: async (update) => {
      return documentKey;
    },
    shouldSendSnapshot: ({ latestServerVersion }) => {
      // create a new snapshot if the active snapshot has more than 100 updates
      return latestServerVersion !== null && latestServerVersion > 10;
    },
    getEphemeralUpdateKey: async () => {
      return documentKey;
    },
    isValidCollaborator: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
  });

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

  useEffect(() => {
    yAwarenessRef.current.setLocalStateField("user", {
      name: `User ${yDocRef.current.clientID}`,
    });

    // remove awareness state when closing the window
    window.addEventListener("beforeunload", () => {
      removeAwarenessStates(
        yAwarenessRef.current,
        [yDocRef.current.clientID],
        "window unload"
      );
    });

    initiateEditor();

    return () => {
      removeAwarenessStates(
        yAwarenessRef.current,
        [yDocRef.current.clientID],
        "document unmount"
      );
    };
  }, []);

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

export default function DocumentPage() {
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
}
