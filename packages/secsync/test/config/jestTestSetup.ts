import sodium from "libsodium-wrappers";
import { WebSocket } from "mock-socket";

// @ts-expect-error
global.setImmediate = jest.useRealTimers;
global.WebSocket = WebSocket;

jest.setTimeout(25000);

beforeEach(async () => {
  await sodium.ready;
});
