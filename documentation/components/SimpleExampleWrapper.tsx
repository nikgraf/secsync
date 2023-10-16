import { default as sodium } from "libsodium-wrappers";
import { Link } from "nextra-theme-docs";
import { useEffect, useRef, useState } from "react";
import { generateId } from "secsync";

type Props = {
  component: React.ComponentType<{
    documentId: string;
    documentKey: Uint8Array;
  }>;
  generateDocumentKey: boolean;
};

const SimpleExampleWrapper: React.FC<Props> = ({
  component,
  generateDocumentKey,
}) => {
  const [isReady, setIsReady] = useState(false);
  const documentKeyRef = useRef<Uint8Array>(null);
  const documentIdRef = useRef<string>(null);

  const updateHashParams = () => {
    const paramsString = window.location.hash.slice(1);
    const searchParams = new URLSearchParams(paramsString);
    if (documentIdRef.current) {
      searchParams.set("id", documentIdRef.current);
    }
    if (generateDocumentKey !== false && documentKeyRef.current) {
      searchParams.set("key", sodium.to_base64(documentKeyRef.current));
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
      if (generateDocumentKey !== false && !documentKey) {
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

    documentKeyRef.current = documentKey;
    documentIdRef.current = documentId;
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

  const searchParams = new URLSearchParams("");
  if (documentIdRef.current) {
    searchParams.set("id", documentIdRef.current);
  }
  if (generateDocumentKey !== false && documentKeyRef.current) {
    searchParams.set("key", sodium.to_base64(documentKeyRef.current));
  }
  const shareUrl = `${window.location.origin}${
    window.location.pathname
  }#${searchParams.toString()}`;

  const Component = component;

  return (
    <>
      <div className="pb-4">
        Share URL: <Link href={shareUrl}>{shareUrl}</Link>
      </div>
      <Component
        documentId={documentIdRef.current}
        documentKey={documentKeyRef.current}
      />
    </>
  );
};

export default SimpleExampleWrapper;
