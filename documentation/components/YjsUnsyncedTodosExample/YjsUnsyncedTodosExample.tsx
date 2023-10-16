import React, { useRef } from "react";
import * as Yjs from "yjs";
import { useYArray } from "../../hooks/useYArray";

export const YjsUnsyncedTodosExample: React.FC = () => {
  // initialize Yjs document
  const yDocRef = useRef<Yjs.Doc>(new Yjs.Doc());
  // get/define the array in the Yjs document
  const yTodos: Yjs.Array<string> = yDocRef.current.getArray("todos");
  // the useYArray hook ensures React re-renders once
  // the array changes and returns the array
  const todos = useYArray(yTodos);

  return (
    <>
      <div>
        <button
          onClick={() => {
            const todoOptions = [
              "piano lesson",
              "spring cleaning",
              "pay taxes",
              "call mum",
            ];
            const content =
              todoOptions[Math.floor(Math.random() * todoOptions.length)];
            yTodos.push([content]);
          }}
        >
          Add generated To-Do
        </button>

        {todos.map((entry, index) => {
          return (
            <div key={`${index}-${entry}`}>
              {entry}{" "}
              <button
                onClick={() => {
                  yTodos.delete(index, 1);
                }}
              >
                x
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
