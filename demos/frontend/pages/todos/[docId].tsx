import Head from "next/head";
import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import sodium from "libsodium-wrappers";
import * as automerge from "automerge";
import type { Doc } from "automerge";
import { v4 as uuidv4 } from "uuid";

type TodoType = {
  value: string;
  completed: boolean;
  createdAt: number;
};

export default function Document() {
  const router = useRouter();
  const docId = Array.isArray(router.query.docId)
    ? router.query.docId[0]
    : router.query.docId;

  const [newTodo, setNewTodo] = React.useState("");

  const [doc, setDoc] = React.useState(() => {
    let doc: Doc<{ todos: { [key: string]: TodoType } }> = automerge.init();
    return automerge.change(doc, (doc) => {
      doc.todos = {};
    });
  });

  useEffect(() => {
    if (!router.isReady) return;

    async function initDocument() {
      await sodium.ready;
    }

    initDocument();
  }, [router.isReady]);

  return (
    <>
      <Head>
        <title>Naisho</title>
        <meta name="description" content="Naisho" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Link href="/">
          <a>Home</a>
        </Link>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const newDoc = automerge.change(doc, (doc) => {
              const id = uuidv4();
              doc.todos[id] = {
                value: newTodo,
                completed: false,
                createdAt: new Date().getTime(),
              };
            });
            setDoc(newDoc);
            setNewTodo("");
          }}
        >
          <input
            placeholder="What needs to be done?"
            onChange={(event) => setNewTodo(event.target.value)}
            value={newTodo}
          />
          <button>Add</button>
        </form>
        <ul>
          {Object.keys(doc.todos)
            .map((id) => {
              return {
                ...doc.todos[id],
                id,
              };
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((todo) => (
              <li key={todo.id}>
                <input
                  onChange={(event) => {
                    const newDoc = automerge.change(doc, (doc) => {
                      doc.todos[todo.id].value = event.target.value;
                    });
                    setDoc(newDoc);
                  }}
                  value={todo.value}
                />
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={(event) => {
                    const newDoc = automerge.change(doc, (doc) => {
                      doc.todos[todo.id].completed = event.target.checked;
                    });
                    setDoc(newDoc);
                  }}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    const newDoc = automerge.change(doc, (doc) => {
                      delete doc.todos[todo.id];
                    });
                    setDoc(newDoc);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
        </ul>
      </main>
    </>
  );
}
