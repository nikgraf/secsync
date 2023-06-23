import sodium from "libsodium-wrappers";
import Head from "next/head";
import { useRouter } from "next/router";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Secsync</title>
        <meta name="description" content="" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <h1>Secsync</h1>
        <p>Architecture for end-to-end encrypted CRDTs</p>
        <h2>Documentation & Source Code</h2>
        <a href="https://github.com/serenity-kit/secsync">
          https://github.com/serenity-kit/secsync
        </a>
        <h2>Document Demo (Yjs + Prosemirror)</h2>
        <button
          onClick={() => {
            router.push(
              `/doc/${uuidv4()}#${sodium.to_base64(
                sodium.crypto_secretbox_keygen()
              )}`
            );
          }}
        >
          Create new Document
        </button>
        <h2>Todos Demo (Automerge)</h2>
        <button
          onClick={() => {
            router.push(
              `/todos/${uuidv4()}#${sodium.to_base64(
                sodium.crypto_secretbox_keygen()
              )}`
            );
          }}
        >
          Create new List
        </button>
      </main>
    </>
  );
}
