import sodium from "libsodium-wrappers";

// @ts-expect-error
global.setImmediate = jest.useRealTimers;

jest.setTimeout(25000);

beforeEach(async () => {
  await sodium.ready;
});
