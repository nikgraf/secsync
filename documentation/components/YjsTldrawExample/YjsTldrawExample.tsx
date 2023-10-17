import { Tldraw } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import { memo } from "react";
import { DevTool } from "secsync-react-devtool";
import { useYjsSecSyncStore } from "./useYjsSecSyncStore";

const websocketHost =
  process.env.NODE_ENV === "development"
    ? "ws://localhost:4000"
    : "wss://secsync.fly.dev";

type Props = {
  documentId: string;
  documentKey: Uint8Array;
};

// not necessary to re-render it - this reduces stress on the browser
const MemoedTldraw = memo(Tldraw);

const YjsTldrawExample: React.FC<Props> = ({ documentId, documentKey }) => {
  const [store, state, send] = useYjsSecSyncStore({
    documentId,
    documentKey,
    websocketHost,
  });
  return (
    <>
      <div style={{ height: 500 }}>
        <MemoedTldraw store={store} />
      </div>
      <div className="mt-8" />
      <DevTool state={state} send={send} />
    </>
  );
};

export default YjsTldrawExample;
