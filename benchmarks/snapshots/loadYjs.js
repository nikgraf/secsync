const fs = require("fs");
const y = require("yjs");

async function snapshot() {
  const fileResult = JSON.parse(fs.readFileSync("./yjs.snapshot.json"));
  const t0 = performance.now();
  const yDoc = new y.Doc();
  const result = Uint8Array.from(atob(fileResult.doc), (c) => c.charCodeAt(0));
  const t1 = performance.now();
  y.applyUpdate(yDoc, result);
  const t2 = performance.now();
  console.log(`Snapshot Base64: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot Doc: ${t2 - t1} milliseconds.`);
}

async function changes() {
  const fileResult = JSON.parse(fs.readFileSync("./yjs.changes.json"));
  const yDoc = new y.Doc();
  const t0 = performance.now();
  const result = fileResult.changes.map((change) => {
    return Uint8Array.from(atob(change), (c) => c.charCodeAt(0));
  });
  const t1 = performance.now();
  result.forEach((change) => {
    y.applyUpdate(yDoc, change);
  });
  const t2 = performance.now();
  console.log(`Changes Base64: ${t1 - t0} milliseconds.`);
  console.log(`Changes Doc: ${t2 - t1} milliseconds.`);
}

async function snapshotWithChanges() {
  const fileResult = JSON.parse(
    fs.readFileSync("./yjs.snapshot-with-changes.json")
  );
  const t0 = performance.now();
  const yDoc = new y.Doc();
  const resultDoc = Uint8Array.from(atob(fileResult.doc), (c) =>
    c.charCodeAt(0)
  );
  const changes = fileResult.changes.map((change) => {
    return Uint8Array.from(atob(change), (c) => c.charCodeAt(0));
  });
  const t1 = performance.now();
  y.applyUpdate(yDoc, resultDoc);
  changes.forEach((change) => {
    y.applyUpdate(yDoc, change);
  });
  const t2 = performance.now();
  console.log(`Snapshot with 1000 Changes Base64: ${t1 - t0} milliseconds.`);
  console.log(`Snapshot with 1000 Changes Doc: ${t2 - t1} milliseconds.`);
}

snapshotWithChanges();
changes();
snapshot();
