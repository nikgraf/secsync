import { Extension } from "@tiptap/core";
import { yCursorPlugin } from "y-prosemirror";
import { Awareness } from "y-protocols/awareness";

export interface YAwarenessExtensionOptions {
  awareness?: Awareness;
  // user: Record<string, any>;
  render(user: Record<string, any>): HTMLElement;
}

type YAwarenessExtensionStorage = {
  users: { clientId: number; [key: string]: any }[];
};

export const YAwarenessExtension = Extension.create<
  YAwarenessExtensionOptions,
  YAwarenessExtensionStorage
>({
  name: "yAwarenessExtension",

  addOptions() {
    return {
      awareness: undefined,
      render: (user) => {
        const cursor = document.createElement("span");
        cursor.style.setProperty("--collab-color", user.color);
        cursor.classList.add("collaboration-cursor__caret");

        const label = document.createElement("div");
        label.classList.add("collaboration-cursor__label");

        label.insertBefore(document.createTextNode(user.name), null);
        cursor.insertBefore(label, null);

        return cursor;
      },
    };
  },

  addStorage() {
    return {
      users: [],
    };
  },

  addProseMirrorPlugins() {
    if (!this.options.awareness) return [];
    return [
      yCursorPlugin(
        this.options.awareness,
        // @ts-ignore
        {
          cursorBuilder: this.options.render,
        }
      ),
    ];
  },
});
