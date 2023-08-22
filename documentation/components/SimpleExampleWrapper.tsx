import { default as sodium } from "libsodium-wrappers";
import { useEffect, useState } from "react";
import { generateId } from "secsync";

type Props = {
  component: React.ComponentType<{
    documentId: string;
    documentKey: Uint8Array;
  }>;
};

const SimpleExampleWrapper: React.FC<Props> = ({ component }) => {
  const [isReady, setIsReady] = useState(false);
  const [documentKey, setDocumentKey] = useState<Uint8Array | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  const updateHashParams = () => {
    const paramsString = window.location.hash.slice(1);
    const searchParams = new URLSearchParams(paramsString);
    if (documentId) {
      searchParams.set("id", documentId);
    }
    if (documentKey) {
      searchParams.set("key", sodium.to_base64(documentKey));
    }
    window.location.hash = searchParams.toString();
  };

  const initialize = async () => {
    if (typeof window === "undefined") return;

    await sodium.ready;

    let documentKey: Uint8Array | null = null;
    try {
      const paramsString = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(paramsString);
      const keyString = searchParams.get("key");
      documentKey = sodium.from_base64(keyString);
    } catch (err) {
    } finally {
      if (!documentKey) {
        documentKey = sodium.randombytes_buf(
          sodium.crypto_aead_chacha20poly1305_IETF_KEYBYTES
        );
      }
    }

    let documentId: string | null = null;
    try {
      const paramsString = window.location.hash.slice(1);
      const searchParams = new URLSearchParams(paramsString);
      documentId = searchParams.get("id");
    } catch (err) {
    } finally {
      if (!documentId) {
        documentId = generateId(sodium);
      }
      documentId;
    }

    setDocumentKey(documentKey);
    setDocumentId(documentId);
    setIsReady(true);
  };

  useEffect(() => {
    initialize();

    window.addEventListener("hashchange", updateHashParams);
    return () => {
      window.removeEventListener("hashchange", updateHashParams);
    };
  }, []);

  useEffect(() => {
    updateHashParams();
  });

  if (typeof window === "undefined" || !isReady) return null;

  const Component = component;
  return <Component documentId={documentId} documentKey={documentKey} />;
};

export default SimpleExampleWrapper;
