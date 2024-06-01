import { IncomingMessage } from "http";
import sodium from "libsodium-wrappers";
import { WebSocket } from "ws";
import { createWebSocketConnection } from "./createWebSocketConnection";
import { addConnection, broadcastMessage, removeConnection } from "./store";

// mock the WebSocket class
jest.mock("ws");
jest.mock("./store");

let mockWs: WebSocket;
let mockReq: IncomingMessage;

beforeEach(async () => {
  await sodium.ready;
  // Initialize mocks for each test
  mockWs = new WebSocket("localhost:8888");
  mockReq = { url: "/test-document" } as IncomingMessage;

  (addConnection as jest.Mock).mockClear();
  (broadcastMessage as jest.Mock).mockClear();
  (removeConnection as jest.Mock).mockClear();
});

it("should handle document error if URL is undefined", async () => {
  mockReq.url = undefined;

  const mockGetDocument = jest.fn();
  const mockCreateSnapshot = jest.fn();
  const mockCreateUpdate = jest.fn();
  const mockHasAccess = jest.fn().mockReturnValue(true);
  const mockHasBroadcastAccess = jest
    .fn()
    .mockImplementation((websocketSessionKeys) =>
      websocketSessionKeys.map(() => true)
    );

  const connection = createWebSocketConnection({
    getDocument: mockGetDocument,
    createSnapshot: mockCreateSnapshot,
    createUpdate: mockCreateUpdate,
    hasAccess: mockHasAccess,
    hasBroadcastAccess: mockHasBroadcastAccess,
  });

  await connection(mockWs, mockReq);

  expect(mockWs.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "document-error" })
  );
  expect(mockWs.close).toHaveBeenCalledTimes(1);
  expect(removeConnection).toHaveBeenCalledWith({
    documentId: "",
    websocket: mockWs,
  });
});

it("should close connection if unauthorized for read access", async () => {
  mockReq.url = "/test-document?sessionKey=123";

  const mockHasAccess = jest.fn().mockReturnValue(false);
  const mockHasBroadcastAccess = jest
    .fn()
    .mockImplementation((websocketSessionKeys) =>
      websocketSessionKeys.map(() => true)
    );

  const connection = createWebSocketConnection({
    getDocument: jest.fn(),
    createSnapshot: jest.fn(),
    createUpdate: jest.fn(),
    hasAccess: mockHasAccess,
    hasBroadcastAccess: mockHasBroadcastAccess,
  });

  await connection(mockWs, mockReq);

  expect(mockHasAccess).toHaveBeenCalledWith({
    action: "read",
    documentId: "test-document",
    websocketSessionKey: "123",
  });
  expect(mockWs.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "unauthorized" })
  );
  expect(mockWs.close).toHaveBeenCalledTimes(1);
});

it("should close connection if document not found", async () => {
  mockReq.url = "/test-document?sessionKey=123";

  const mockGetDocument = jest.fn().mockReturnValue(undefined);
  const mockHasAccess = jest.fn().mockReturnValue(true);
  const mockHasBroadcastAccess = jest
    .fn()
    .mockImplementation((websocketSessionKeys) =>
      websocketSessionKeys.map(() => true)
    );

  const connection = createWebSocketConnection({
    getDocument: mockGetDocument,
    createSnapshot: jest.fn(),
    createUpdate: jest.fn(),
    hasAccess: mockHasAccess,
    hasBroadcastAccess: mockHasBroadcastAccess,
  });

  await connection(mockWs, mockReq);

  expect(mockWs.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "document-not-found" })
  );
  expect(mockWs.close).toHaveBeenCalledTimes(1);
});

it("should add connection and send document if found", async () => {
  mockReq.url = "/test-document?sessionKey=123";

  const mockDocument = {
    snapshot: {},
    updates: [],
    snapshotProofChain: [],
  };

  const mockGetDocument = jest.fn().mockReturnValue(mockDocument);
  const mockHasAccess = jest.fn().mockReturnValue(true);
  const mockHasBroadcastAccess = jest
    .fn()
    .mockImplementation((websocketSessionKeys) =>
      websocketSessionKeys.map(() => true)
    );

  const connection = createWebSocketConnection({
    getDocument: mockGetDocument,
    createSnapshot: jest.fn(),
    createUpdate: jest.fn(),
    hasAccess: mockHasAccess,
    hasBroadcastAccess: mockHasBroadcastAccess,
  });

  await connection(mockWs, mockReq);

  expect(mockGetDocument).toHaveBeenCalledWith({
    documentId: "test-document",
    knownSnapshotId: undefined,
    knownSnapshotUpdateClocks: undefined,
    mode: "complete",
  });
  expect(addConnection).toHaveBeenCalledWith({
    documentId: "test-document",
    websocket: mockWs,
    websocketSessionKey: "123",
  });
  expect(mockWs.send).toHaveBeenCalledWith(
    JSON.stringify({ type: "document", ...mockDocument })
  );
});

it("should properly parse and send through knownSnapshotId & knownSnapshotUpdateClocks", async () => {
  const mockDocument = {
    snapshot: {},
    updates: [],
    snapshotProofChain: [],
  };

  const mockGetDocument = jest.fn().mockReturnValue(mockDocument);
  const mockHasAccess = jest.fn().mockReturnValue(true);
  const mockHasBroadcastAccess = jest
    .fn()
    .mockImplementation((websocketSessionKeys) =>
      websocketSessionKeys.map(() => true)
    );

  const connection = createWebSocketConnection({
    getDocument: mockGetDocument,
    createSnapshot: jest.fn(),
    createUpdate: jest.fn(),
    hasAccess: mockHasAccess,
    hasBroadcastAccess: mockHasBroadcastAccess,
  });

  mockReq.url = "/test-document?sessionKey=123&knownSnapshotId=123";

  await connection(mockWs, mockReq);

  expect(mockGetDocument).toHaveBeenCalledWith({
    documentId: "test-document",
    knownSnapshotId: "123",
    knownSnapshotUpdateClocks: undefined,
    mode: "complete",
  });

  mockReq.url = "/test-document?sessionKey=123&knownSnapshotId=555";
  await connection(mockWs, mockReq);

  expect(mockGetDocument).toHaveBeenCalledWith({
    documentId: "test-document",
    knownSnapshotId: "555",
    knownSnapshotUpdateClocks: undefined,
    mode: "complete",
  });

  const knownSnapshotUpdateClocks = { yhj: 1, jkl: 2 };
  const knownSnapshotUpdateClocksQuery = encodeURIComponent(
    JSON.stringify(knownSnapshotUpdateClocks)
  );
  mockReq.url = `/test-document?sessionKey=123&knownSnapshotId=42&knownSnapshotUpdateClocks=${knownSnapshotUpdateClocksQuery}`;
  await connection(mockWs, mockReq);

  expect(mockGetDocument).toHaveBeenCalledWith({
    documentId: "test-document",
    knownSnapshotId: "42",
    knownSnapshotUpdateClocks: { yhj: 1, jkl: 2 },
    mode: "complete",
  });
});
