const fs = require("fs");
const zlib = require("zlib");
const automerge = require("@automerge/automerge");
const y = require("yjs");
const secsync = require("secsync");
const sodium = require("libsodium-wrappers");

async function main() {
  await sodium.ready;

  const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
  // generated using secsync.generateId(sodium);
  const snapshotId = "DJ1VrlamnVQRkaqO5lpcZXFJCWC-gsZV";
  const key = sodium.from_hex(
    "724b092810ec86d7e35c9d067702b31ef90bc43a7b598626749914d6a3e033ed"
  );
  const clientAKeyPair = {
    privateKey: sodium.from_base64(
      "g3dtwb9XzhSzZGkxTfg11t1KEIb4D8rO7K54R6dnxArvgg_OzZ2GgREtG7F5LvNp3MS8p9vsio4r6Mq7SZDEgw"
    ),
    publicKey: sodium.from_base64(
      "74IPzs2dhoERLRuxeS7zadzEvKfb7IqOK-jKu0mQxIM"
    ),
    keyType: "ed25519",
  };

  let { txns } = JSON.parse(
    zlib.gunzipSync(fs.readFileSync("../automerge-paper.json.gz"))
  );

  let doc = automerge.from({ text: new automerge.Text() });
  let docWithoutLastChanges = automerge.from({ text: new automerge.Text() });

  // const yDoc = new y.Doc();
  // const yDocChanges = [];
  // const yDocWithoutLastChanges = new y.Doc();

  const y2Doc = new y.Doc();
  const y2DocChanges = [];
  const y2DocWithoutLastChanges = new y.Doc();

  // NOTE: reduce the amount of changes used
  txns = txns.slice(0, 10000);

  // // yjs
  // yDoc.on("update", function (updateMessage) {
  //   yDocChanges.push(updateMessage);
  // });

  // yjs2
  y2Doc.on("updateV2", function (updateMessage) {
    y2DocChanges.push(updateMessage);
  });

  for (let i = 0; i < txns.length; i++) {
    if (i % 10000 == 0) console.log(i);
    const { patches } = txns[i];

    for (const [pos, delHere, insContent] of patches) {
      // console.log(pos, delHere, insContent);

      // automerge
      doc = automerge.change(doc, (currentDoc) => {
        if (delHere > 0) currentDoc.text.deleteAt(pos, delHere);
        if (insContent !== "") currentDoc.text.insertAt(pos, insContent);
      });
      if (i < txns.length - 1000) {
        docWithoutLastChanges = automerge.change(
          docWithoutLastChanges,
          (currentDoc) => {
            if (delHere > 0) currentDoc.text.deleteAt(pos, delHere);
            if (insContent !== "") currentDoc.text.insertAt(pos, insContent);
          }
        );
      }

      // // yjs
      // yDoc.transact((txn) => {
      //   const text = txn.doc.getText();
      //   for (const [pos, delHere, insContent] of patches) {
      //     if (delHere > 0) text.delete(pos, delHere);
      //     if (insContent !== "") text.insert(pos, insContent);
      //   }
      // });

      // if (i < txns.length - 1000) {
      //   yDocWithoutLastChanges.transact((txn) => {
      //     const text = txn.doc.getText();
      //     for (const [pos, delHere, insContent] of patches) {
      //       if (delHere > 0) text.delete(pos, delHere);
      //       if (insContent !== "") text.insert(pos, insContent);
      //     }
      //   });
      // }

      // yjs2
      y2Doc.transact((txn) => {
        const text = txn.doc.getText();
        for (const [pos, delHere, insContent] of patches) {
          if (delHere > 0) text.delete(pos, delHere);
          if (insContent !== "") text.insert(pos, insContent);
        }
      });

      if (i < txns.length - 1000) {
        y2DocWithoutLastChanges.transact((txn) => {
          const text = txn.doc.getText();
          for (const [pos, delHere, insContent] of patches) {
            if (delHere > 0) text.delete(pos, delHere);
            if (insContent !== "") text.insert(pos, insContent);
          }
        });
      }
    }
  }

  console.log("Start writing Automerge files");
  const allChangesAsBase64 = automerge.getAllChanges(doc).map((change) => {
    return Buffer.from(change).toString("base64");
  });
  fs.writeFileSync(
    "automerge.snapshot.json",
    JSON.stringify({ doc: Buffer.from(automerge.save(doc)).toString("base64") })
  );
  fs.writeFileSync(
    "automerge.changes.json",
    JSON.stringify({ changes: allChangesAsBase64 })
  );
  fs.writeFileSync(
    "automerge.snapshot-with-changes.json",
    JSON.stringify({
      doc: Buffer.from(automerge.save(docWithoutLastChanges)).toString(
        "base64"
      ),
      changes: allChangesAsBase64.slice(-1001),
    })
  );

  console.log("Start writing SecSync Automerge files");
  const snapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
  };
  const snapshot = secsync.createSnapshot(
    automerge.save(doc),
    snapshotPublicData,
    key,
    clientAKeyPair,
    "",
    "",
    sodium
  );
  fs.writeFileSync("secsync.automerge.snapshot.json", JSON.stringify(snapshot));

  const publicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
  };
  const allUpdates = automerge.getAllChanges(doc).map((change, index) => {
    return secsync.createUpdate(
      change,
      publicData,
      key,
      clientAKeyPair,
      index,
      sodium
    );
  });

  fs.writeFileSync(
    "secsync.automerge.changes.json",
    JSON.stringify({ updates: allUpdates })
  );

  const snapshotWithoutLastChanges = secsync.createSnapshot(
    automerge.save(docWithoutLastChanges),
    snapshotPublicData,
    key,
    clientAKeyPair,
    "",
    "",
    sodium
  );

  fs.writeFileSync(
    "secsync.automerge.snapshot-with-changes.json",
    JSON.stringify({
      snapshot: snapshotWithoutLastChanges,
      updates: allUpdates.slice(-1001),
    })
  );

  // console.log("Start writing Yjs files");
  // const allYChangesAsBase64 = yDocChanges.map((change) => {
  //   return Buffer.from(change).toString("base64");
  // });
  // fs.writeFileSync(
  //   "yjs.snapshot.json",
  //   JSON.stringify({
  //     doc: Buffer.from(y.encodeStateAsUpdate(yDoc)).toString("base64"),
  //   })
  // );
  // fs.writeFileSync(
  //   "yjs.changes.json",
  //   JSON.stringify({ changes: allYChangesAsBase64 })
  // );
  // fs.writeFileSync(
  //   "yjs.snapshot-with-changes.json",
  //   JSON.stringify({
  //     doc: Buffer.from(y.encodeStateAsUpdate(yDocWithoutLastChanges)).toString(
  //       "base64"
  //     ),
  //     changes: allYChangesAsBase64.slice(-1001),
  //   })
  // );

  console.log("Start writing Yjs2 files");
  const allY2ChangesAsBase64 = y2DocChanges.map((change) => {
    return Buffer.from(change).toString("base64");
  });
  fs.writeFileSync(
    "yjs2.snapshot.json",
    JSON.stringify({
      doc: Buffer.from(y.encodeStateAsUpdateV2(y2Doc)).toString("base64"),
    })
  );
  fs.writeFileSync(
    "yjs2.changes.json",
    JSON.stringify({ changes: allY2ChangesAsBase64 })
  );
  fs.writeFileSync(
    "yjs2.snapshot-with-changes.json",
    JSON.stringify({
      doc: Buffer.from(
        y.encodeStateAsUpdateV2(y2DocWithoutLastChanges)
      ).toString("base64"),
      changes: allY2ChangesAsBase64.slice(-1001),
    })
  );

  console.log("Start writing SecSync Yjs2 files");
  const yjs2SnapshotPublicData = {
    snapshotId,
    docId,
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
    parentSnapshotId: "",
    parentSnapshotUpdateClocks: {},
  };
  const yjs2Snapshot = secsync.createSnapshot(
    y.encodeStateAsUpdateV2(y2Doc),
    yjs2SnapshotPublicData,
    key,
    clientAKeyPair,
    "",
    "",
    sodium
  );
  fs.writeFileSync("secsync.yjs2.snapshot.json", JSON.stringify(yjs2Snapshot));

  const yjs2PublicData = {
    refSnapshotId: snapshotId,
    docId,
    pubKey: sodium.to_base64(clientAKeyPair.publicKey),
  };
  const yjs2AllUpdates = y2DocChanges.map((change, index) => {
    return secsync.createUpdate(
      change,
      yjs2PublicData,
      key,
      clientAKeyPair,
      index,
      sodium
    );
  });

  fs.writeFileSync(
    "secsync.yjs2.changes.json",
    JSON.stringify({ updates: yjs2AllUpdates })
  );

  const yjs2SnapshotWithoutLastChanges = secsync.createSnapshot(
    y.encodeStateAsUpdateV2(y2DocWithoutLastChanges),
    yjs2SnapshotPublicData,
    key,
    clientAKeyPair,
    "",
    "",
    sodium
  );

  fs.writeFileSync(
    "secsync.yjs2.snapshot-with-changes.json",
    JSON.stringify({
      snapshot: yjs2SnapshotWithoutLastChanges,
      updates: yjs2AllUpdates.slice(-1001),
    })
  );
}

main();
