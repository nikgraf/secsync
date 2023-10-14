import { Tldraw } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { useYjsSecSyncStore } from "./useYjsSecSyncStore";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

const YjsTldrawExample: React.FC<Props> = ({ documentId, documentKey }) => {
  const store = useYjsSecSyncStore({ documentId, documentKey, websocketHost });
  return (
    <div style={{ height: 500 }}>
      <Tldraw autoFocus store={store} />
    </div>
  );
};

export default YjsTldrawExample;
