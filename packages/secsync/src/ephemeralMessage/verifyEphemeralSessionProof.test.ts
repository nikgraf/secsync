import sodium, { KeyPair } from "libsodium-wrappers";
import { createEphemeralMessageProof } from "./createEphemeralSessionProof";
import { verifyEphemeralSessionProof } from "./verifyEphemeralSessionProof";

let remoteClientSessionId: string;
let currentClientSessionId: string;
let currentClientSignatureKeyPair: KeyPair;
let proof: Uint8Array;

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

  proof = createEphemeralMessageProof(
    remoteClientSessionId,
    currentClientSessionId,
    currentClientSignatureKeyPair,
    sodium
  );
});

it("should return a valid signature", async () => {
  const isValid = verifyEphemeralSessionProof(
    proof,
    remoteClientSessionId,
    currentClientSessionId,
    currentClientSignatureKeyPair.publicKey,
    sodium
  );

  expect(isValid).toBe(true);
});

it("should throw error if any of the required parameters is missing", () => {
  const isValid = verifyEphemeralSessionProof(
    new Uint8Array([32, 0, 99]),
    remoteClientSessionId,
    currentClientSessionId,
    currentClientSignatureKeyPair.publicKey,
    sodium
  );

  expect(isValid).toBe(false);

  // flipped currentClientSessionId & remoteClientSessionId
  const isValid2 = verifyEphemeralSessionProof(
    proof,
    currentClientSessionId,
    remoteClientSessionId,
    currentClientSignatureKeyPair.publicKey,
    sodium
  );

  expect(isValid2).toBe(false);
});
