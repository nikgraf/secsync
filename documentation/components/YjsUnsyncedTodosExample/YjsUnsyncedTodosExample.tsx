import React, { useRef, useState } from "react";
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
  // local state for the text of a new to-do
  const [newTodoText, setNewTodoText] = useState("");

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
    </>
  );
};
