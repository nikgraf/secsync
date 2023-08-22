import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import sodium, { KeyPair } from "libsodium-wrappers";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { generateId } from "secsync";
import { useYjsSync } from "secsync-react-yjs";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import * as Yjs from "yjs";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

const Document: React.FC = () => {
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

  const [documentKey] = useState<Uint8Array | null>(() => {
    if (typeof window === "undefined") return;
    let newDocumentKey: Uint8Array | null = null;
    try {
      const paramsString = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(paramsString);
      const keyString = searchParams.get("key");
      newDocumentKey = sodium.from_base64(keyString);
    } catch (err) {
    } finally {
      if (!newDocumentKey) {
        newDocumentKey = sodium.randombytes_buf(
          sodium.crypto_aead_chacha20poly1305_IETF_KEYBYTES
        );
      }
      return newDocumentKey;
    }
  });
  const [documentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return;
    let newDocumentId: string | null = null;
    try {
      const paramsString = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(paramsString);
      newDocumentId = searchParams.get("id");
    } catch (err) {
    } finally {
      if (!newDocumentId) {
        newDocumentId = generateId(sodium);
      }
      return newDocumentId;
    }
  });

  useEffect(() => {
    const paramsString = window.location.hash.slice(1);
    const searchParams = new URLSearchParams(paramsString);
    searchParams.set("id", documentId);
    searchParams.set("key", sodium.to_base64(documentKey));
    window.location.hash = searchParams.toString();
  });

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  // @ts-expect-error
  const yAwarenessRef = useRef<Awareness>(new Awareness(yDocRef.current));

  const [state, send] = useYjsSync({
    // @ts-expect-error
    yDoc: yDocRef.current,
    yAwareness: yAwarenessRef.current,
    documentId,
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
        <EditorContent
          editor={editor}
          className="border border-primary-200 p-2 rounded"
        />
      </main>
    </>
  );
};

const DocumentPage: React.FC = () => {
  const [libsodiumIsReady, setLibsodiumIsReady] = useState(false);

  useEffect(() => {
    sodium.ready.then(() => {
      setLibsodiumIsReady(true);
    });
  }, []);

  if (!libsodiumIsReady) return null;

  return <Document />;
};

export default DocumentPage;
