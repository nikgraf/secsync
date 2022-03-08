const fs = require("fs");
const zlib = require("zlib");
const automerge = require("automerge");

async function main() {
  let { txns } = JSON.parse(
    zlib.gunzipSync(fs.readFileSync("../automerge-paper.json.gz"))
  );

  let doc = automerge.from({ text: new automerge.Text() });
  let docWithoutLastChanges = automerge.from({ text: new automerge.Text() });

  // NOTE: reduce the amount of changes used
  // txns = txns.slice(0, 10000);

  for (let i = 0; i < txns.length; i++) {
    if (i % 10000 == 0) console.log(i);
    const { patches } = txns[i];

    for (const [pos, delHere, insContent] of patches) {
      // console.log(pos, delHere, insContent);
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
    }
  }

  const allChanges = automerge.getAllChanges(doc);

  const allChangesAsBase64 = allChanges.map((change) => {
    return Buffer.from(change).toString("base64");
  });
  const recentChangesAsBase64 = allChanges.slice(-1001).map((change) => {
    return Buffer.from(change).toString("base64");
  });

  fs.writeFileSync(
    "snapshot.json",
    JSON.stringify({ doc: Buffer.from(automerge.save(doc)).toString("base64") })
  );
  fs.writeFileSync(
    "changes.json",
    JSON.stringify({ changes: allChangesAsBase64 })
  );
  fs.writeFileSync(
    "snapshot-with-changes.json",
    JSON.stringify({
      doc: Buffer.from(automerge.save(docWithoutLastChanges)).toString(
        "base64"
      ),
      changes: recentChangesAsBase64,
    })
  );
}

main();
