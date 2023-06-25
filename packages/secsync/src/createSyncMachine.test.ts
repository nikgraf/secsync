import { Server } from "mock-socket";
import { interpret } from "xstate";
import { createSyncMachine } from "./createSyncMachine";

const url = "wss://www.example.com";
let mockServer: Server;

beforeEach(() => {
  mockServer = new Server(url);
});

afterEach((done) => {
  mockServer.stop(() => {
    done();
  });
});

it("should start with connecting", (done) => {
  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      websocketHost: url,
      websocketSessionKey: "sessionKey",
    })
  ).onTransition((state) => {
    if (state.matches("connecting")) {
      done();
    }
  });

  syncService.start();
});

it("should connect", (done) => {
  const url = "wss://www.example.com";

  const syncMachine = createSyncMachine();
  const syncService = interpret(
    syncMachine.withContext({
      ...syncMachine.context,
      websocketHost: url,
      websocketSessionKey: "sessionKey",
    })
  ).onTransition((state) => {
    if (state.matches("connected")) {
      done();
    }
  });

  syncService.start();
});

// TODO add test to verify a reply attack with older ephemeral updates are rejected
