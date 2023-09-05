import sodium, { KeyPair } from "libsodium-wrappers";
import { createEphemeralUpdateProof } from "./createEphemeralSessionProof";

let remoteClientSessionId;
let currentClientSessionId;
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
  const proof = createEphemeralUpdateProof(
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
    createEphemeralUpdateProof(
      remoteClientSessionId,
      currentClientSessionId,
      null,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralUpdateProof(
      null,
      currentClientSessionId,
      currentClientSignatureKeyPair,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralUpdateProof(
      remoteClientSessionId,
      null,
      currentClientSignatureKeyPair,
      sodium
    );
  }).toThrow();

  expect(() => {
    createEphemeralUpdateProof(
      remoteClientSessionId,
      currentClientSessionId,
      currentClientSignatureKeyPair,
      null
    );
  }).toThrow();
});
