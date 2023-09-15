import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import sodium, { KeyPair } from "libsodium-wrappers";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { generateId } from "secsync";
import { useYjsSync } from "secsync-react-yjs";
import * as Yjs from "yjs";

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

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());

  const [state, send] = useYjsSync({
    yDoc: yDocRef.current,
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
    shouldSendSnapshot: ({ snapshotUpdatesCount }) => {
      // create a new snapshot if the active snapshot has more than 10 updates
      return snapshotUpdatesCount > 10;
    },
    isValidCollaborator: async (signingPublicKey: string) => {
      return true;
    },
    sodium,
    logging: "debug",
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // the Collaboration extension comes with its own history handling
        history: false,
      }),
      Collaboration.configure({
        document: yDocRef.current,
        field: "page",
      }),
    ],
  });

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
        <EditorContent editor={editor} />
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
