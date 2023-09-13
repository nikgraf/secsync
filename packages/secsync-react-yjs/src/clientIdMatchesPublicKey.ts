import { numberToUint53 } from "./utils/numberToUint53";

function equalUint8Arrays(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

type Params = {
  clientId: number;
  clientPublicKey: Uint8Array;
};

export const clientIdMatchesPublicKey = ({
  clientId,
  clientPublicKey,
}: Params) => {
  const uint8Array = numberToUint53(clientId);
  return equalUint8Arrays(uint8Array.slice(0, 4), clientPublicKey.slice(0, 4));
};
