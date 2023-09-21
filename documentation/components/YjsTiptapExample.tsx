import Collaboration from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import sodium, { KeyPair } from "libsodium-wrappers";
import { useRef, useState } from "react";
import { generateId } from "secsync";
import { useYjsSync } from "secsync-react-yjs";
import { YAwarenessExtension } from "tiptap-extension-y-awareness";
import * as Yjs from "yjs";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

const Button = (props) => {
  return (
    <button
      {...props}
      className={`text-gray-900 bg-white border border-gray-300 focus:outline-none hover:bg-gray-100 focus:ring-4 focus:ring-gray-200 font-medium rounded-lg text-sm px-1 py-1 mr-1 mb-1 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700 dark:hover:border-gray-600 dark:focus:ring-gray-700 ${
        props.className || ""
      }`}
    />
  );
};

const YjsTiptapExample: React.FC<Props> = ({ documentId, documentKey }) => {
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

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());

  const [state, send, , yAwareness] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketHost,
    websocketSessionKey: "your-secret-session-key",
    onSnapshotSaved: async ({ snapshotId }) => {},
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
      YAwarenessExtension.configure({
        awareness: yAwareness,
      }),
    ],
  });

  return (
    <>
      <div>
        {state.matches("connected") && "Connected"}
        {state.matches("connecting") && "Connecting …"}
        {state.matches("disconnected") && "Disconnected"}
        {state.matches("failed") && "Error in loading or sending data"}

        <Button
          disabled={!state.matches("connected")}
          onClick={() => {
            send({ type: "DISCONNECT" });
          }}
        >
          Disconnect WebSocket
        </Button>
        <Button
          disabled={!state.matches("disconnected")}
          onClick={() => {
            send({ type: "CONNECT" });
          }}
        >
          Connect WebSocket
        </Button>
      </div>

      <div className="tiptap-toolbar">
        <Button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor?.can().chain().focus().toggleBold().run()}
          className={editor?.isActive("bold") ? "is-active" : ""}
        >
          bold
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor?.can().chain().focus().toggleItalic().run()}
          className={editor?.isActive("italic") ? "is-active" : ""}
        >
          italic
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor?.can().chain().focus().toggleStrike().run()}
          className={editor?.isActive("strike") ? "is-active" : ""}
        >
          strike
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor?.can().chain().focus().toggleCode().run()}
          className={editor?.isActive("code") ? "is-active" : ""}
        >
          code
        </Button>
        <Button onClick={() => editor.chain().focus().unsetAllMarks().run()}>
          clear marks
        </Button>
        <Button onClick={() => editor.chain().focus().clearNodes().run()}>
          clear nodes
        </Button>
        <Button
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={editor?.isActive("paragraph") ? "is-active" : ""}
        >
          paragraph
        </Button>
        <Button
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={
            editor?.isActive("heading", { level: 1 }) ? "is-active" : ""
          }
        >
          h1
        </Button>
        <Button
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={
            editor?.isActive("heading", { level: 2 }) ? "is-active" : ""
          }
        >
          h2
        </Button>
        <Button
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          className={
            editor?.isActive("heading", { level: 3 }) ? "is-active" : ""
          }
        >
          h3
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor?.isActive("bulletList") ? "is-active" : ""}
        >
          bullet list
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor?.isActive("orderedList") ? "is-active" : ""}
        >
          ordered list
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={editor?.isActive("codeBlock") ? "is-active" : ""}
        >
          code block
        </Button>
        <Button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor?.isActive("blockquote") ? "is-active" : ""}
        >
          blockquote
        </Button>
        <Button
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          horizontal rule
        </Button>
        <Button onClick={() => editor.chain().focus().setHardBreak().run()}>
          hard break
        </Button>
        <Button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor?.can().chain().focus().undo().run()}
        >
          undo
        </Button>
        <Button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor?.can().chain().focus().redo().run()}
        >
          redo
        </Button>
      </div>

      <EditorContent
        editor={editor}
        className="border border-primary-200 p-2 rounded"
      />
    </>
  );
};

export default YjsTiptapExample;
