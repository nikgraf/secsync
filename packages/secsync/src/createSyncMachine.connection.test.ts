import sodium from "libsodium-wrappers";
import { Server } from "mock-socket";
import { parse as parseUrl } from "url";
import { interpret } from "xstate";
import { createSyncMachine } from "./createSyncMachine";

const url = "wss://www.example.com";
const docId = "6e46c006-5541-11ec-bf63-0242ac130002";
let mockServer: Server;

beforeEach(async () => {
  await sodium.ready;
  mockServer = new Server(`${url}/${docId}`);
});

afterEach((done) => {
  mockServer.stop(() => {
    done();
  });
});

test("should start with connecting", (done) => {
  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      documentId: docId,
      websocketHost: url,
      websocketSessionKey: "sessionKey",
      sodium,
    })
  ).onTransition((state) => {
    if (state.matches("connecting")) {
      syncService.stop();
      done();
    }
  });

  syncService.start();
});

test("should connect", (done) => {
  const url = "wss://www.example.com";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      documentId: docId,
      websocketHost: url,
      websocketSessionKey: "sessionKey",
      sodium,
    })
  ).onTransition((state) => {
    if (state.matches("connected")) {
      syncService.stop();
      done();
    }
  });

  syncService.start();
});

test("should connect and use lastKnownSnapshotId as query param", (done) => {
  const url = "wss://www.example.com";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      documentId: docId,
      websocketHost: url,
      websocketSessionKey: "mySessionKey",
      sodium,
      knownSnapshotInfo: {
        snapshotId: "mySnapshotId",
        parentSnapshotProof: "myParentSnapshotProof",
        snapshotCiphertextHash: "mySnapshotCiphertextHash",
      },
    })
  );

  mockServer.on("connection", (socket) => {
    expect(socket.url).toBe(
      `wss://www.example.com/${docId}?sessionKey=mySessionKey&knownSnapshotId=mySnapshotId`
    );
    syncService.stop();
    done();
  });

  syncService.start();
});

test("should connect and use lastKnownSnapshotId & lastKnownSnapshotUpdatesClocks as query param", (done) => {
  const url = "wss://www.example.com";

  const syncMachine = createSyncMachine();
  const updatesClocks = {
    publicKeyA: 2,
    publicKeyB: 9999,
  };
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      documentId: docId,
      websocketHost: url,
      websocketSessionKey: "mySessionKey",
      sodium,
      knownSnapshotInfo: {
        snapshotId: "mySnapshotId",
        parentSnapshotProof: "myParentSnapshotProof",
        snapshotCiphertextHash: "mySnapshotCiphertextHash",
        updatesClocks,
      },
    })
  );

  mockServer.on("connection", (socket) => {
    expect(socket.url).toBe(
      `wss://www.example.com/${docId}?sessionKey=mySessionKey&knownSnapshotId=mySnapshotId&&knownSnapshotUpdatesClocks=%7B%22publicKeyA%22%3A2%2C%22publicKeyB%22%3A9999%7D`
    );

    const urlParts = parseUrl(socket.url, true);
    const lastKnownSnapshotUpdatesClocks = JSON.parse(
      decodeURIComponent(urlParts.query.knownSnapshotUpdatesClocks as string)
    );

    expect(lastKnownSnapshotUpdatesClocks).toEqual(updatesClocks);
    syncService.stop();
    done();
  });

  syncService.start();
});
