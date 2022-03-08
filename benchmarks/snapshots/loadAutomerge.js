const fs = require("fs");
const automerge = require("automerge");
const { Buffer } = require("buffer");

async function snapshot() {
  const fileResult = JSON.parse(fs.readFileSync("./snapshot.json"));
  const t0 = performance.now();
  const result = Buffer.from(fileResult.doc, "base64");
  const t1 = performance.now();
  const doc = automerge.load(result);
  const t2 = performance.now();
  console.log(`Snapshot Base64: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot Doc: ${t2 - t1} milliseconds.`);
}

async function changes() {
  const result = JSON.parse(fs.readFileSync("./changes.json")).changes;
  let doc = automerge.init();
  const t0 = performance.now();
  const changes = result.map((change) => {
    return Buffer.from(change, "base64");
  });
  const t1 = performance.now();
  [doc] = automerge.applyChanges(doc, changes);
  const t2 = performance.now();
  console.log(`Changes Base64: ${t1 - t0} milliseconds.`);
  console.log(`Changes Doc: ${t2 - t1} milliseconds.`);
}

async function snapshotWithChanges() {
  const result = JSON.parse(fs.readFileSync("./snapshot-with-changes.json"));
  const t0 = performance.now();
  const docBinary = Buffer.from(result.doc, "base64");
  const changes = result.changes.map((change) => {
    return Buffer.from(change, "base64");
  });
  const t1 = performance.now();
  let doc = automerge.load(docBinary);
  [doc] = automerge.applyChanges(doc, changes);
  const t2 = performance.now();
  console.log(`Snapshot with 1000 Changes Base64: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot with 1000 Changes Doc: ${t2 - t1} milliseconds.`);
}

snapshotWithChanges();
changes();
snapshot();
