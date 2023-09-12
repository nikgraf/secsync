import { uint53ToNumber } from "./utils/uint53ToNumber";

type Params = {
  sodium: typeof import("libsodium-wrappers");
  clientPublicKey: Uint8Array;
};

export const generateWeakYjsClientId = ({
  sodium,
  clientPublicKey,
}: Params) => {
  const part1 = clientPublicKey.slice(0, 4);
  // should be a sufficient large enough space to avoid collisions
  const part2 = sodium.randombytes_buf(3);
  return uint53ToNumber(new Uint8Array([...part1, ...part2]));
};
