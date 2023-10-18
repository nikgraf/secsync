const fs = require("fs");
const zlib = require("zlib");
const automerge = require("@automerge/automerge");
const y = require("yjs");

async function main() {
  let { txns } = JSON.parse(
    zlib.gunzipSync(fs.readFileSync("../automerge-paper.json.gz"))
  );

  let doc = automerge.from({ text: new automerge.Text() });
  let docWithoutLastChanges = automerge.from({ text: new automerge.Text() });

  const yDoc = new y.Doc();
  const yDocChanges = [];
  const yDocWithoutLastChanges = new y.Doc();

  const y2Doc = new y.Doc();
  const y2DocChanges = [];
  const y2DocWithoutLastChanges = new y.Doc();

  // NOTE: reduce the amount of changes used
  // txns = txns.slice(0, 10000);

  // yjs
  yDoc.on("update", function (updateMessage) {
    yDocChanges.push(updateMessage);
  });

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

      // yjs
      yDoc.transact((txn) => {
        const text = txn.doc.getText();
        for (const [pos, delHere, insContent] of patches) {
          if (delHere > 0) text.delete(pos, delHere);
          if (insContent !== "") text.insert(pos, insContent);
        }
      });

      if (i < txns.length - 1000) {
        yDocWithoutLastChanges.transact((txn) => {
          const text = txn.doc.getText();
          for (const [pos, delHere, insContent] of patches) {
            if (delHere > 0) text.delete(pos, delHere);
            if (insContent !== "") text.insert(pos, insContent);
          }
        });
      }

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

  console.log("Start writing Yjs files");
  const allYChangesAsBase64 = yDocChanges.map((change) => {
    return Buffer.from(change).toString("base64");
  });
  fs.writeFileSync(
    "yjs.snapshot.json",
    JSON.stringify({
      doc: Buffer.from(y.encodeStateAsUpdate(yDoc)).toString("base64"),
    })
  );
  fs.writeFileSync(
    "yjs.changes.json",
    JSON.stringify({ changes: allYChangesAsBase64 })
  );
  fs.writeFileSync(
    "yjs.snapshot-with-changes.json",
    JSON.stringify({
      doc: Buffer.from(y.encodeStateAsUpdate(yDocWithoutLastChanges)).toString(
        "base64"
      ),
      changes: allYChangesAsBase64.slice(-1001),
    })
  );

  console.log("Start writing Yjs2 files");
  const allY2ChangesAsBase64 = y2DocChanges.map((change) => {
    return Buffer.from(change).toString("base64");
  });
  fs.writeFileSync(
    "yjs2.snapshot.json",
    JSON.stringify({
      doc: Buffer.from(y.encodeStateAsUpdateV2(yDoc)).toString("base64"),
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
}

main();
