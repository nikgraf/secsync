import sodium from "libsodium-wrappers";
import React, { useId, useRef, useState } from "react";
import { DevTool } from "secsync-react-devtool";
import { useYjsSync } from "secsync-react-yjs";
import * as Yjs from "yjs";
import { useYArray } from "../../hooks/useYArray";

const websocketEndpoint =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  showDevTool: boolean;
};

const authorizedAuthors = [
  {
    privateKey:
      "90gI4rbA8cApZe72j3oJ0f31ymuleLuZdsaKm64jEUwlcH4y5KshGsNcNaWzQaBJKp3cHdUEnnP3bgXloyOytA",
    publicKey: "JXB-MuSrIRrDXDWls0GgSSqd3B3VBJ5z924F5aMjsrQ",
  },
  {
    privateKey:
      "dko_5CR064h36HQmOuYPcBQIS-xdM7wSQJAJjCnIO9SvQ-tKBL_BvFFw-AhkHPSKRPb3F6kw5kfTV3GGJ4awYg",
    publicKey: "r0PrSgS_wbxRcPgIZBz0ikT29xepMOZH01dxhieGsGI",
  },
  {
    privateKey:
      "rTzxM6i7bVjH3eG3jqvyI1E6ZFzJhNYsvUwiJxAfTlOC5jWTkIieCdRxpG3mXySar6HS1z5bL0Rdx1azVTr3jw",
    publicKey: "guY1k5CIngnUcaRt5l8kmq-h0tc-Wy9EXcdWs1U6948",
  },
  {
    privateKey:
      "MH_NDZ4aUfCT0cpCr-tZ8Hhvh4MYpw56IZkdbwVmUQn0wCzxJ_IYw_IzyZ3kxdOXIQFtg-UxykGK8hjiA-x1hg",
    publicKey: "9MAs8SfyGMPyM8md5MXTlyEBbYPlMcpBivIY4gPsdYY",
  },
  {
    privateKey:
      "ZcknsT8b9HdksFl9SxQbs0soLsWfNoGIGP52E4-8FcIQSgu83cXNvcqcYPAFO0wUatx_h19GM34sz-8u5RfejA",
    publicKey: "EEoLvN3Fzb3KnGDwBTtMFGrcf4dfRjN-LM_vLuUX3ow",
  },
];

const nonAuthorizedAuthors = [
  {
    privateKey:
      "wjNC0kxBFJzaBN02Gr3a87pJlGUj6LTAM4PNMT2hFTxuGHbOc48VvXd4lhLJELmV4q7ahne0H3nCs271MSx_mA",
    publicKey: "bhh2znOPFb13eJYSyRC5leKu2oZ3tB95wrNu9TEsf5g",
  },
];

export const AuthorizedAuthorsExample: React.FC<Props> = ({
  documentId,
  showDevTool,
}) => {
  const [authorKeyPair, setAuthorKeyPair] = useState<null | sodium.KeyPair>(
    null
  );

  const selectId = useId();

  if (authorKeyPair === null) {
    return (
      <div className="todoapp p-6">
        <div>
          <label htmlFor={selectId}>Choose your author to get started:</label>
          <select
            id={selectId}
            onChange={(event) => {
              const authorizedEntry = authorizedAuthors.find(
                (author) => author.publicKey === event.target.value
              );
              if (authorizedEntry) {
                setAuthorKeyPair({
                  privateKey: sodium.from_base64(authorizedEntry.privateKey),
                  publicKey: sodium.from_base64(authorizedEntry.publicKey),
                  keyType: "ed25519",
                });
              }

              const nonAuthorizedEntry = nonAuthorizedAuthors.find(
                (author) => author.publicKey === event.target.value
              );

              if (nonAuthorizedEntry) {
                setAuthorKeyPair({
                  privateKey: sodium.from_base64(nonAuthorizedEntry.privateKey),
                  publicKey: sodium.from_base64(nonAuthorizedEntry.publicKey),
                  keyType: "ed25519",
                });
              }
            }}
            className="mt-2 block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
          >
            <option disabled selected>
              -- select an author --
            </option>
            {authorizedAuthors.map((authorizedAuthor) => (
              <option value={authorizedAuthor.publicKey}>
                {authorizedAuthor.publicKey} (authorized)
              </option>
            ))}
            {nonAuthorizedAuthors.map((nonAuthorizedAuthor) => (
              <option value={nonAuthorizedAuthor.publicKey}>
                {nonAuthorizedAuthor.publicKey} (not authorized)
              </option>
            ))}
          </select>

          <p className="pt-8">
            NOTE: Choosing the same author in multiple clients will result in
            errors when trying to create update in parallel.
          </p>
        </div>
      </div>
    );
  }

  return <Todos authorKeyPair={authorKeyPair} documentId={documentId} />;
};

type TodosProps = {
  documentId: string;
  authorKeyPair: sodium.KeyPair;
};

export const Todos: React.FC<TodosProps> = ({ documentId, authorKeyPair }) => {
  const documentKey = sodium.from_base64(
    "MTcyipWZ6Kiibd5fATw55i9wyEU7KbdDoTE_MRgDR98"
  );

  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  const yTodos: Yjs.Array<string> = yDocRef.current.getArray("todos");
  const todos = useYArray(yTodos);
  const [newTodoText, setNewTodoText] = useState("");

  const [state, send] = useYjsSync({
    yDoc: yDocRef.current,
    documentId,
    signatureKeyPair: authorKeyPair,
    websocketEndpoint,
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
      // create a new snapshot if the active snapshot has more than 100 updates
      return snapshotUpdatesCount > 100;
    },
    isValidClient: async (signingPublicKey: string) => {
      return authorizedAuthors.some((author) => {
        console.log(
          author.publicKey,
          signingPublicKey,
          author.publicKey === signingPublicKey
        );
        return author.publicKey === signingPublicKey;
      });
    },
    sodium,
    logging: "debug",
  });

  return (
    <>
      <div className="todoapp">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            yTodos.push([newTodoText]);
            setNewTodoText("");
          }}
        >
          <input
            placeholder="What needs to be done?"
            onChange={(event) => setNewTodoText(event.target.value)}
            value={newTodoText}
            className="new-todo"
          />
          <button className="add">Add</button>
        </form>

        <ul className="todo-list">
          {todos.map((entry, index) => {
            return (
              <li key={`${index}-${entry}`}>
                <div className="edit">{entry}</div>
                <button
                  className="destroy"
                  onClick={() => {
                    yTodos.delete(index, 1);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-8" />
      <DevTool state={state} send={send} />
    </>
  );
};
