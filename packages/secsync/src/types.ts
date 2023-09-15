import type { KeyPair } from "libsodium-wrappers";
import { z } from "zod";
import { SnapshotProofChainEntry } from "./snapshot/isValidAncestorSnapshot";

export const SnapshotClocks = z.record(z.string(), z.number());

export type SnapshotClocks = z.infer<typeof SnapshotClocks>;

export const SnapshotPublicData = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  snapshotId: z.string(),
  parentSnapshotClocks: SnapshotClocks,
});

export type SnapshotPublicData = z.infer<typeof SnapshotPublicData>;

export const SnapshotPublicDataWithParentSnapshotProof = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  snapshotId: z.string(),
  parentSnapshotProof: z.string(),
  parentSnapshotClocks: SnapshotClocks,
});

export type SnapshotPublicDataWithParentSnapshotProof = z.infer<
  typeof SnapshotPublicDataWithParentSnapshotProof
>;

export const UpdatePublicData = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  refSnapshotId: z.string(),
});

export type UpdatePublicData = z.infer<typeof UpdatePublicData>;

export const UpdatePublicDataWithClock = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  refSnapshotId: z.string(),
  clock: z.number(),
});

export type UpdatePublicDataWithClock = z.infer<
  typeof UpdatePublicDataWithClock
>;

export const EphemeralMessagePublicData = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
});

export type EphemeralMessagePublicData = z.infer<
  typeof EphemeralMessagePublicData
>;

export const Snapshot = z.object({
  ciphertext: z.string(),
  nonce: z.string(),
  signature: z.string(), // ciphertext + nonce + publicData
  publicData: SnapshotPublicDataWithParentSnapshotProof,
});

export type Snapshot = z.infer<typeof Snapshot>;

export const SnapshotWithClientData = Snapshot.extend({
  lastKnownSnapshotId: z.string().nullable().optional(),
  additionalServerData: z.unknown().optional(),
});

export type SnapshotWithClientData = z.infer<typeof SnapshotWithClientData>;

export const Update = z.object({
  ciphertext: z.string(),
  nonce: z.string(),
  signature: z.string(), // ciphertext + nonce + publicData
  publicData: UpdatePublicDataWithClock,
});

export type Update = z.infer<typeof Update>;

export const EphemeralMessage = z.object({
  ciphertext: z.string(),
  nonce: z.string(),
  signature: z.string(), // ciphertext + nonce + publicData
  publicData: EphemeralMessagePublicData,
});

export type EphemeralMessage = z.infer<typeof EphemeralMessage>;

export const Event = z.union([Snapshot, Update, EphemeralMessage]);

export type Event = z.infer<typeof Event>;

export type ParentSnapshotProofInfo = {
  // TODO should the id be part of the proof hash?
  id: string; // used for the clocks
  ciphertext: string;
  parentSnapshotProof: string;
};

type KnownSnapshotInfo = SnapshotProofChainEntry & {
  id: string;
};

export type AdditionalAuthenticationDataValidations = {
  snapshot?: z.SomeZodObject;
  update?: z.SomeZodObject;
  ephemeralMessage?: z.SomeZodObject;
};

export type SyncMachineConfig = {
  documentId: string;
  signatureKeyPair: KeyPair;
  websocketHost: string;
  websocketSessionKey: string;
  applySnapshot: (decryptedSnapshot: any) => void;
  getSnapshotKey: (
    snapshot: any | undefined
  ) => Promise<Uint8Array> | Uint8Array;
  getNewSnapshotData: () => Promise<{
    readonly id: string;
    readonly data: Uint8Array | string;
    readonly key: Uint8Array;
    readonly publicData: any;
    readonly additionalServerData?: any;
  }>;
  applyChanges: (updates: any[]) => void;
  getUpdateKey: (update: any) => Promise<Uint8Array> | Uint8Array;
  applyEphemeralMessage: (
    ephemeralMessages: any,
    authorPublicKey: string
  ) => void;
  getEphemeralMessageKey: () => Promise<Uint8Array> | Uint8Array;
  shouldSendSnapshot: (info: {
    activeSnapshotId: string | null;
    snapshotUpdatesCount: number;
  }) => boolean;
  isValidCollaborator: (signingPublicKey: string) => boolean | Promise<boolean>;
  serializeChanges: (changes: any[]) => string;
  deserializeChanges: (serializeChanges: string) => any;
  sodium: any;
  onSnapshotSaved?: () => void | Promise<void>;
  onCustomMessage?: (message: any) => Promise<void> | void;
  knownSnapshotInfo?: KnownSnapshotInfo;
  additionalAuthenticationDataValidations?: AdditionalAuthenticationDataValidations;
  /** default: "off" */
  logging?: "off" | "error" | "debug";
};

export type CreateSnapshotParams = {
  snapshot: SnapshotWithClientData;
  activeSnapshotInfo?: {
    snapshotId: string;
  };
};

export type CreateUpdateParams = {
  update: Update;
};

export type GetDocumentParams = {
  documentId: string;
  lastKnownSnapshotId?: string;
};

export type HasAccessParams = {
  action: "read" | "write-snapshot" | "write-update" | "send-ephemeral-message";
  documentId: string;
};

export type ValidSessions = {
  [authorPublicKey: string]: { sessionId: string; sessionCounter: number };
};

export type EphemeralMessagesSession = {
  id: string;
  counter: number;
  validSessions: ValidSessions;
};
