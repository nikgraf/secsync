import sodium, { KeyPair } from "libsodium-wrappers";
import { generateId } from "../crypto/generateId";
import { EphemeralMessagePublicData } from "../types";
import { createEphemeralMessage } from "./createEphemeralMessage";
import { verifyAndDecryptEphemeralMessage } from "./verifyAndDecryptEphemeralMessage";

let docId = "6e46c006-5541-11ec-bf63-0242ac130002";

let clientAKeyPair: KeyPair;
let clientAPublicKey: string;
let clientACounter: number;
let clientASessionId: string;
let clientAPublicData: EphemeralMessagePublicData;

let clientBKeyPair: KeyPair;
let clientBPublicKey: string;
let clientBCounter: number;
let clientBSessionId: string;
let clientBPublicData: EphemeralMessagePublicData;

let clientCKeyPair: KeyPair;
let clientCPublicKey: string;
let clientCCounter: number;
let clientCSessionId: string;

let key: Uint8Array;

beforeEach(async () => {
  await sodium.ready;

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
  clientAPublicData = {
    docId,
    pubKey: clientAPublicKey,
  };
  clientASessionId = generateId(sodium);
  clientACounter = 1000;

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
  clientBPublicData = {
    docId,
    pubKey: clientBPublicKey,
  };
  clientBSessionId = generateId(sodium);
  clientBCounter = 50;

  clientCKeyPair = {
    privateKey: sodium.from_base64(
      "r5hcoJlYJxIWBTFiV_Jkr2oRoxpWdFf-sJmtM0WpNCsX0AQargVmlkzv5D8loRNMV7DuWZEw7Auk5_VFiUrynA"
    ),
    publicKey: sodium.from_base64(
      "F9AEGq4FZpZM7-Q_JaETTFew7lmRMOwLpOf1RYlK8pw"
    ),
    keyType: "ed25519",
  };
  clientCPublicKey = sodium.to_base64(clientCKeyPair.publicKey);
  clientCSessionId = generateId(sodium);
  clientCCounter = 200;
});

test("establish authentication and send a message between clientA and clientB each", async () => {
  // Client A generates the `initialize` message
  const ephemeralMessage1 = createEphemeralMessage(
    new Uint8Array(),
    "initialize",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage1,
    key,
    docId,
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
  expect(result1.proof?.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralMessage2 = createEphemeralMessage(
    // @ts-expect-error
    result1.proof,
    "proofAndRequestProof",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the `proofAndRequestProof` message and generates
  // the `proof` message
  const result2 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage2,
    key,
    docId,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(typeof result2.proof).toBe("object");
  // @ts-expect-error
  expect(result2.proof.length).toBe(64);
  expect(result2.requestProof).toBe(false);

  // Client A generates the `proof` message
  const ephemeralMessage3 = createEphemeralMessage(
    // @ts-expect-error
    result2.proof,
    "proof",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `proof` message
  const result3 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage3,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result3.content).toBe(undefined);
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result3.proof).toBeUndefined();
  expect(result3.requestProof).toBe(false);

  // Client A generates a message
  const ephemeralMessage4 = createEphemeralMessage(
    new Uint8Array([42, 97, 97]),
    "message",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the message
  const result4 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage4,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      // @ts-expect-error
      validSessions: result3.validSessions,
    },
    clientBKeyPair,
    sodium
  );

  expect(result4.content).toBeDefined();
  // @ts-expect-error
  expect(result4.content.length).toBe(3);
  // @ts-expect-error
  expect(result4.content[0]).toBe(42);
  // @ts-expect-error
  expect(result4.content[1]).toBe(97);
  // @ts-expect-error
  expect(result4.content[2]).toBe(97);
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result4.proof).toBeUndefined();
  expect(result4.requestProof).toBe(undefined);

  // Client B generates a message
  const ephemeralMessage5 = createEphemeralMessage(
    new Uint8Array([91, 11]),
    "message",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the message
  const result5 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage5,
    key,
    docId,
    {
      id: clientASessionId,
      counter: clientACounter,
      // @ts-expect-error
      validSessions: result2.validSessions,
    },
    clientAKeyPair,
    sodium
  );

  expect(result5.content).toBeDefined();
  // @ts-expect-error
  expect(result5.content.length).toBe(2);
  // @ts-expect-error
  expect(result5.content[0]).toBe(91);
  // @ts-expect-error
  expect(result5.content[1]).toBe(11);
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(result5.proof).toBeUndefined();
  expect(result5.requestProof).toBe(undefined);
});

test("establish authentication and ignore message if documentId is incorrect", async () => {
  // Client A generates the `initialize` message
  const ephemeralMessage1 = createEphemeralMessage(
    new Uint8Array(),
    "initialize",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage1,
    key,
    docId,
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
  // @ts-expect-error
  expect(result1.proof.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralMessage2 = createEphemeralMessage(
    // @ts-expect-error
    result1.proof,
    "proofAndRequestProof",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the `proofAndRequestProof` message and generates
  // the `proof` message
  const result2 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage2,
    key,
    docId,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(typeof result2.proof).toBe("object");
  // @ts-expect-error
  expect(result2.proof.length).toBe(64);
  expect(result2.requestProof).toBe(false);

  // Client A generates the `proof` message
  const ephemeralMessage3 = createEphemeralMessage(
    // @ts-expect-error
    result2.proof,
    "proof",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `proof` message
  const result3 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage3,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result3.content).toBe(undefined);
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result3.proof).toBeUndefined();
  expect(result3.requestProof).toBe(false);

  // Client A generates a message
  const ephemeralMessage4 = createEphemeralMessage(
    new Uint8Array([42, 97, 97]),
    "message",
    {
      ...clientAPublicData,
      docId: "WRONG_DOCUMENT_ID",
    },
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the message
  const result4 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage4,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      // @ts-expect-error
      validSessions: result3.validSessions,
    },
    clientBKeyPair,
    sodium
  );

  expect(result4.content).toBeUndefined();
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 2
  );
  expect(result4.proof).toBeUndefined();
  expect(result4.requestProof).toBeUndefined();
});

test("establish authentication without an initialize message and send a message between clientA and clientB each", async () => {
  // Client A never generates the `initialize` message, but right away sends a message
  const ephemeralMessage1 = createEphemeralMessage(
    new Uint8Array([42, 97, 97]),
    "message",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage1,
    key,
    docId,
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
  // @ts-expect-error
  expect(result1.proof.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralMessage2 = createEphemeralMessage(
    // @ts-expect-error
    result1.proof,
    "proofAndRequestProof",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the `proofAndRequestProof` message and generates
  // the `proof` message
  const result2 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage2,
    key,
    docId,
    {
      id: clientASessionId,
      counter: clientACounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  // @ts-expect-error
  expect(result2.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(typeof result2.proof).toBe("object");
  // @ts-expect-error
  expect(result2.proof.length).toBe(64);
  expect(result2.requestProof).toBe(false);

  // Client A generates the `proof` message
  const ephemeralMessage3 = createEphemeralMessage(
    // @ts-expect-error
    result2.proof,
    "proof",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `proof` message
  const result3 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage3,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      validSessions: {},
    },
    clientAKeyPair,
    sodium
  );

  expect(result3.content).toBe(undefined);
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result3.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result3.proof).toBeUndefined();
  expect(result3.requestProof).toBe(false);

  // Client A generates a message
  const ephemeralMessage4 = createEphemeralMessage(
    new Uint8Array([42, 97, 97]),
    "message",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the message
  const result4 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage4,
    key,
    docId,
    {
      id: clientBSessionId,
      counter: clientBCounter,
      // @ts-expect-error
      validSessions: result3.validSessions,
    },
    clientBKeyPair,
    sodium
  );

  expect(result4.content).toBeDefined();
  // @ts-expect-error
  expect(result4.content.length).toBe(3);
  // @ts-expect-error
  expect(result4.content[0]).toBe(42);
  // @ts-expect-error
  expect(result4.content[1]).toBe(97);
  // @ts-expect-error
  expect(result4.content[2]).toBe(97);
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionId).toBe(
    clientASessionId
  );
  // @ts-expect-error
  expect(result4.validSessions[clientAPublicKey].sessionCounter).toBe(
    clientACounter - 1
  );
  expect(result4.proof).toBeUndefined();
  expect(result4.requestProof).toBe(undefined);

  // Client B generates a message
  const ephemeralMessage5 = createEphemeralMessage(
    new Uint8Array([91, 11]),
    "message",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client A receives the message
  const result5 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage5,
    key,
    docId,
    {
      id: clientASessionId,
      counter: clientACounter,
      // @ts-expect-error
      validSessions: result2.validSessions,
    },
    clientAKeyPair,
    sodium
  );

  expect(result5.content).toBeDefined();
  // @ts-expect-error
  expect(result5.content.length).toBe(2);
  // @ts-expect-error
  expect(result5.content[0]).toBe(91);
  // @ts-expect-error
  expect(result5.content[1]).toBe(11);
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey]).toBeDefined();
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey].sessionId).toBe(
    clientBSessionId
  );
  // @ts-expect-error
  expect(result5.validSessions[clientBPublicKey].sessionCounter).toBe(
    clientBCounter - 1
  );
  expect(result5.proof).toBeUndefined();
  expect(result5.requestProof).toBe(undefined);
});

test("verifyAndDecryptEphemeralMessage ignores proof if only relevant for another client", async () => {
  const publicData: EphemeralMessagePublicData = {
    docId,
    pubKey: clientAPublicKey,
  };

  // Client A generates the `initialize` message
  const ephemeralMessage1 = createEphemeralMessage(
    new Uint8Array(),
    "initialize",
    clientAPublicData,
    key,
    clientAKeyPair,
    clientASessionId,
    clientACounter,
    sodium
  );
  clientACounter++;

  // Client B receives the `initialize` message and generates
  // the `proofAndRequestProof` message
  const result1 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage1,
    key,
    docId,
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
  // @ts-expect-error
  expect(result1.proof.length).toBe(64);
  expect(result1.requestProof).toBe(true);

  // Client B generates the `proofAndRequestProof` message
  const ephemeralMessage2 = createEphemeralMessage(
    // @ts-expect-error
    result1.proof,
    "proofAndRequestProof",
    clientBPublicData,
    key,
    clientBKeyPair,
    clientBSessionId,
    clientBCounter,
    sodium
  );
  clientBCounter++;

  // Client C receives the `proofAndRequestProof` message and ignores it
  const result2 = verifyAndDecryptEphemeralMessage(
    ephemeralMessage2,
    key,
    docId,
    {
      id: clientCSessionId,
      counter: clientCCounter,
      validSessions: {},
    },
    clientCKeyPair,
    sodium
  );

  expect(result2.content).toBe(undefined);
  expect(result2.validSessions).toStrictEqual({});
  expect(result2.proof).toBe(undefined);
  expect(result2.requestProof).toBe(undefined);
});
