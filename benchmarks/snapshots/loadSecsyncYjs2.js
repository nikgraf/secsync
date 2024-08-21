const fs = require("fs");
const y = require("yjs");
const { Buffer } = require("buffer");
const secsync = require("secsync");
const sodium = require("libsodium-wrappers");

async function snapshot() {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );
  const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
  const snapshotId = "DJ1VrlamnVQRkaqO5lpcZXFJCWC-gsZV";
  const clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const fileResult = JSON.parse(
    fs.readFileSync("./secsync.yjs2.snapshot.json")
  );
  const t0 = performance.now();
  const result = secsync.verifyAndDecryptSnapshot(
    fileResult,
    key,
    docId,
    clientAKeyPair.publicKey,
    sodium
  );
  const t1 = performance.now();
  const yDoc = new y.Doc();
  y.applyUpdateV2(yDoc, result.content);
  const t2 = performance.now();
  console.log(`Snapshot Decryption: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot Doc: ${t2 - t1} milliseconds.`);
  console.log(`Snapshot Decryption + Doc: ${t2 - t0} milliseconds.`);
}

async function changes() {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );
  const snapshotId = "DJ1VrlamnVQRkaqO5lpcZXFJCWC-gsZV";

  const result = JSON.parse(
    fs.readFileSync("./secsync.yjs2.changes.json")
  ).updates;
  const t0 = performance.now();
  const changes = result.map((update, index) => {
    const { content, clock, error } = secsync.verifyAndDecryptUpdate(
      update,
      key,
      snapshotId,
      index - 1,
      sodium
    );
    return content;
  });
  const t1 = performance.now();
  const yDoc = new y.Doc();
  changes.forEach((change) => {
    y.applyUpdateV2(yDoc, change);
  });
  const t2 = performance.now();
  console.log(`Changes Decryption: ${t1 - t0} milliseconds.`);
  console.log(`Changes Decryption + Doc: ${t2 - t1} milliseconds.`);
  console.log(`Changes Decryption + Doc: ${t2 - t0} milliseconds.`);
}

async function snapshotWithChanges() {
  await sodium.ready;

  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );
  const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
  const snapshotId = "DJ1VrlamnVQRkaqO5lpcZXFJCWC-gsZV";
  const clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  const fileResult = JSON.parse(
    fs.readFileSync("./secsync.yjs2.snapshot-with-changes.json")
  );
  const t0 = performance.now();
  const snapshot = secsync.verifyAndDecryptSnapshot(
    fileResult.snapshot,
    key,
    docId,
    clientAKeyPair.publicKey,
    sodium
  );

  const initialClock = fileResult.updates[0].publicData.clock;

  const changes = fileResult.updates.map((update, index) => {
    const { content, clock, error } = secsync.verifyAndDecryptUpdate(
      update,
      key,
      snapshotId,
      initialClock + index - 1,
      sodium
    );
    return content;
  });

  const t1 = performance.now();
  const yDoc = new y.Doc();
  y.applyUpdateV2(yDoc, snapshot.content);
  changes.forEach((change) => {
    y.applyUpdateV2(yDoc, change);
  });

  const t2 = performance.now();
  console.log(`Snapshot + Updates Decryption: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot + Updates Doc: ${t2 - t1} milliseconds.`);
  console.log(`Snapshot + Updates Decryption + Doc: ${t2 - t0} milliseconds.`);
}

snapshotWithChanges();
changes();
snapshot();
