import sodium, { KeyPair } from "libsodium-wrappers";
import { generateWeakYjsClientId } from "./generateWeakYjsClientId";
import { isValidWeakYjsClientId } from "./isValidWeakYjsClientId";

let clientAKeyPair: KeyPair;
let clientBKeyPair: KeyPair;

beforeEach(async () => {
  await sodium.ready;

  clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  clientBKeyPair = {
    privateKey: sodium.from_base64(
      "ElVI9nkbOypSu2quCTXH1i1gGlcd-Sxd7S6ym9sNZj48ben-hOmefr13D9Y1Lnys3CuhwuPb6DMh_oDln913_g"
    ),
    publicKey: sodium.from_base64(
      "PG3p_oTpnn69dw_WNS58rNwrocLj2-gzIf6A5Z_dd_4"
    ),
    keyType: "ed25519",
  };
});

test("", () => {
  const clientId = generateWeakYjsClientId({
    sodium,
    clientPublicKey: clientAKeyPair.publicKey,
  });
  expect(
    isValidWeakYjsClientId({
      clientId,
      clientPublicKey: clientAKeyPair.publicKey,
    })
  ).toBe(true);
  expect(
    isValidWeakYjsClientId({
      clientId,
      clientPublicKey: clientBKeyPair.publicKey,
    })
  ).toBe(false);
});
