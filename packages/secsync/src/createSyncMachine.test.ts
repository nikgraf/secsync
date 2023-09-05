import sodium from "libsodium-wrappers";
import { Server } from "mock-socket";
import { interpret } from "xstate";
import { createSyncMachine } from "./createSyncMachine";

const url = "wss://www.example.com";
let mockServer: Server;

beforeEach(async () => {
  await sodium.ready;
  mockServer = new Server(url);
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
