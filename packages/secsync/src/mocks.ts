import type { KeyPair } from "libsodium-wrappers";

export const defaultTestMachineInput = {
  signatureKeyPair: {} as KeyPair,
  applySnapshot: () => undefined,
  getSnapshotKey: () => Promise.resolve(new Uint8Array()),
  applyChanges: () => undefined,
  getNewSnapshotData: () => ({
    data: "",
    key: new Uint8Array(),
    publicData: {},
  }),
  applyEphemeralMessage: () => undefined,
  shouldSendSnapshot: () => false,
  serializeChanges: () => "",
  deserializeChanges: () => [],
  onDocumentUpdated: undefined,
  isValidClient: async () => false,
};
