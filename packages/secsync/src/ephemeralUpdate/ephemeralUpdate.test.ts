import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { EphemeralUpdatePublicData } from "../types";
import { createEphemeralUpdate } from "./createEphemeralUpdate";
import { verifyAndDecryptEphemeralUpdate } from "./verifyAndDecryptEphemeralUpdate";

let clientAKeyPair: KeyPair;
let clientAPublicKey: string;
let clientACounter: number;
let clientASessionId: string;

let clientBKeyPair: KeyPair;
let clientBPublicKey: string;
let clientBCounter: number;
let clientBSessionId: string;

let key: Uint8Array;

beforeEach(async () => {
  await sodium.ready;
  clientASessionId = generateId(sodium);
  clientACounter = 1000;
  clientBSessionId = generateId(sodium);
  clientBCounter = 50;

  key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );

  clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };
  clientAPublicKey = sodium.to_base64(clientAKeyPair.publicKey);
  clientBKeyPair = {
    privateKey: sodium.from_base64(
      "ElVI9nkbOypSu2quCTXH1i1gGlcd-Sxd7S6ym9sNZj48ben-hOmefr13D9Y1Lnys3CuhwuPb6DMh_oDln913_g"
    ),
    publicKey: sodium.from_base64(
      "PG3p_oTpnn69dw_WNS58rNwrocLj2-gzIf6A5Z_dd_4"
    ),
    keyType: "ed25519",
  };
  clientBPublicKey = sodium.to_base64(clientBKeyPair.publicKey);
});

test("establish authentication and send a message between clientA and clientB each", async () => {
  const publicData: EphemeralUpdatePublicData = {
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: clientAPublicKey,
  };

  // Client A generates the `initialize` message
  const ephemeralUpdate1 = createEphemeralUpdate(
    new Uint8Array(),
    "initialize",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate1,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientBKeyPair,
    sodium
  );

  expect(result1.content).toBe(undefined);
  expect(result1.validSessions).toStrictEqual({});
  expect(typeof result1.proof).toBe("object");
  expect(result1.proof.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralUpdate2 = createEphemeralUpdate(
    result1.proof,
    "proofAndRequestProof",
    publicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the `proofAndRequestProof` message and generates
  // the `proof` message
  const result2 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate2,
    key,
    clientBKeyPair.publicKey,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  expect(result2.validSessions[clientBPublicKey]).toBeDefined();
  expect(result2.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  expect(result2.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(typeof result2.proof).toBe("object");
  expect(result2.proof.length).toBe(64);
  expect(result2.requestProof).toBe(false);

  // Client A generates the `proof` message
  const ephemeralUpdate3 = createEphemeralUpdate(
    result2.proof,
    "proof",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `proof` message
  const result3 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate3,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result3.content).toBe(undefined);
  expect(result3.validSessions[clientAPublicKey]).toBeDefined();
  expect(result3.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  expect(result3.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result3.proof).toBeUndefined();
  expect(result3.requestProof).toBe(false);

  // Client A generates a message
  const ephemeralUpdate4 = createEphemeralUpdate(
    new Uint8Array([42, 97, 97]),
    "message",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the message
  const result4 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate4,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: result3.validSessions,
    },
    clientBKeyPair,
    sodium
  );

  expect(result4.content).toBeDefined();
  expect(result4.content.length).toBe(3);
  expect(result4.content[0]).toBe(42);
  expect(result4.content[1]).toBe(97);
  expect(result4.content[2]).toBe(97);
  expect(result4.validSessions[clientAPublicKey]).toBeDefined();
  expect(result4.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  expect(result4.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result4.proof).toBeUndefined();
  expect(result4.requestProof).toBe(undefined);

  // Client B generates a message
  const ephemeralUpdate5 = createEphemeralUpdate(
    new Uint8Array([91, 11]),
    "message",
    publicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the message
  const result5 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate5,
    key,
    clientBKeyPair.publicKey,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: result2.validSessions,
    },
    clientAKeyPair,
    sodium
  );

  expect(result5.content).toBeDefined();
  expect(result5.content.length).toBe(2);
  expect(result5.content[0]).toBe(91);
  expect(result5.content[1]).toBe(11);
  expect(result5.validSessions[clientBPublicKey]).toBeDefined();
  expect(result5.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  expect(result5.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(result5.proof).toBeUndefined();
  expect(result5.requestProof).toBe(undefined);
});

test("establish authentication without an initialize message and send a message between clientA and clientB each", async () => {
  const publicData: EphemeralUpdatePublicData = {
    docId: "6e46c006-5541-11ec-bf63-0242ac130002",
    pubKey: clientAPublicKey,
  };

  // Client A never generates the `initialize` message, but right away sends a message
  const ephemeralUpdate1 = createEphemeralUpdate(
    new Uint8Array([42, 97, 97]),
    "message",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate1,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientBKeyPair,
    sodium
  );

  expect(result1.content).toBe(undefined);
  expect(result1.validSessions).toStrictEqual({});
  expect(typeof result1.proof).toBe("object");
  expect(result1.proof.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralUpdate2 = createEphemeralUpdate(
    result1.proof,
    "proofAndRequestProof",
    publicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the `proofAndRequestProof` message and generates
  // the `proof` message
  const result2 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate2,
    key,
    clientBKeyPair.publicKey,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  expect(result2.validSessions[clientBPublicKey]).toBeDefined();
  expect(result2.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  expect(result2.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(typeof result2.proof).toBe("object");
  expect(result2.proof.length).toBe(64);
  expect(result2.requestProof).toBe(false);

  // Client A generates the `proof` message
  const ephemeralUpdate3 = createEphemeralUpdate(
    result2.proof,
    "proof",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `proof` message
  const result3 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate3,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result3.content).toBe(undefined);
  expect(result3.validSessions[clientAPublicKey]).toBeDefined();
  expect(result3.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  expect(result3.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result3.proof).toBeUndefined();
  expect(result3.requestProof).toBe(false);

  // Client A generates a message
  const ephemeralUpdate4 = createEphemeralUpdate(
    new Uint8Array([42, 97, 97]),
    "message",
    publicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the message
  const result4 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate4,
    key,
    clientAKeyPair.publicKey,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: result3.validSessions,
    },
    clientBKeyPair,
    sodium
  );

  expect(result4.content).toBeDefined();
  expect(result4.content.length).toBe(3);
  expect(result4.content[0]).toBe(42);
  expect(result4.content[1]).toBe(97);
  expect(result4.content[2]).toBe(97);
  expect(result4.validSessions[clientAPublicKey]).toBeDefined();
  expect(result4.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  expect(result4.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result4.proof).toBeUndefined();
  expect(result4.requestProof).toBe(undefined);

  // Client B generates a message
  const ephemeralUpdate5 = createEphemeralUpdate(
    new Uint8Array([91, 11]),
    "message",
    publicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the message
  const result5 = verifyAndDecryptEphemeralUpdate(
    ephemeralUpdate5,
    key,
    clientBKeyPair.publicKey,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: result2.validSessions,
    },
    clientAKeyPair,
    sodium
  );

  expect(result5.content).toBeDefined();
  expect(result5.content.length).toBe(2);
  expect(result5.content[0]).toBe(91);
  expect(result5.content[1]).toBe(11);
  expect(result5.validSessions[clientBPublicKey]).toBeDefined();
  expect(result5.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  expect(result5.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(result5.proof).toBeUndefined();
  expect(result5.requestProof).toBe(undefined);
});
