import sodium, { KeyPair } from "libsodium-wrappers";
import { createEphemeralMessageProof } from "./createEphemeralSessionProof";

let remoteClientSessionId: string;
let currentClientSessionId: string;
let currentClientSignatureKeyPair: KeyPair;

beforeEach(async () => {
  await sodium.ready;
  remoteClientSessionId = "WVuBN_XDUmwzZaNc3tUKHV6NfbU-erx-";
  currentClientSessionId = "5ygax_FZvpZsizQV5hC23kGWFF_iyPLi";

  currentClientSignatureKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };
});

it("should return a valid signature", async () => {
  const proof = createEphemeralMessageProof(
    remoteClientSessionId,
    currentClientSessionId,
    currentClientSignatureKeyPair,
    sodium
  );

  expect(sodium.to_base64(proof)).toBe(
    "JjKW5_lgRv6_CVxIDubz5oMtyUBfHiv4dkJvkNkIMu5pmIGFHhw9lMbRxWfRv3jm0g6EvSabO_HlOGjYLnuUDA"
  );
});

it("should throw error if any of the required parameters is missing", () => {
  expect(() => {
    createEphemeralMessageProof(
      remoteClientSessionId,
      currentClientSessionId,
      // @ts-expect-error
      null,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralMessageProof(
      // @ts-expect-error
      null,
      currentClientSessionId,
      currentClientSignatureKeyPair,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralMessageProof(
      remoteClientSessionId,
      // @ts-expect-error
      null,
      currentClientSignatureKeyPair,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralMessageProof(
      remoteClientSessionId,
      currentClientSessionId,
      currentClientSignatureKeyPair,
      // @ts-expect-error
      null
    );
  }).toThrow();
});
