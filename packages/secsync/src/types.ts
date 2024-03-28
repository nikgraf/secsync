import type { KeyPair } from "libsodium-wrappers";
import { z } from "zod";

export const SnapshotUpdateClocks = z.record(z.string(), z.number());

export type SnapshotUpdateClocks = z.infer<typeof SnapshotUpdateClocks>;

export const SnapshotPublicData = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  snapshotId: z.string(),
  parentSnapshotId: z.string(),
  parentSnapshotUpdateClocks: SnapshotUpdateClocks,
});

export type SnapshotPublicData = z.infer<typeof SnapshotPublicData>;

export const SnapshotPublicDataWithParentSnapshotProof = z.object({
  docId: z.string(),
  pubKey: z.string(), // public signing key
  snapshotId: z.string(),
  parentSnapshotId: z.string(),
  parentSnapshotProof: z.string(),
  parentSnapshotUpdateClocks: SnapshotUpdateClocks,
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

export type OnDocumentUpdatedEventType =
  | "snapshot-saved"
  | "snapshot-received"
  | "update-saved"
  | "update-received";

export type LoadDocumentParams = {
  knownSnapshotInfo: SnapshotInfoWithUpdateClocks;
  mode: GetDocumentMode;
};

export type AdditionalAuthenticationDataValidations = {
  snapshot?: z.SomeZodObject;
  update?: z.SomeZodObject;
  ephemeralMessage?: z.SomeZodObject;
};

export type NewSnapshotData = {
  readonly data: Uint8Array | string;
  readonly key: Uint8Array;
  readonly publicData: any;
  readonly additionalServerData?: any;
};

export type SyncMachineConfig = {
  documentId: string;
  signatureKeyPair: KeyPair;
  websocketHost: string;
  websocketSessionKey: string;
  applySnapshot: (decryptedSnapshot: any) => void;
  getSnapshotKey: (
    snapshotInfo: SnapshotProofInfo | null
  ) => Promise<Uint8Array> | Uint8Array;
  getNewSnapshotData: ({
    id,
  }: {
    id: string;
  }) => Promise<NewSnapshotData> | NewSnapshotData;
  applyChanges: (changes: any[]) => void;
  applyEphemeralMessage: (
    ephemeralMessages: any,
    authorPublicKey: string
  ) => void;
  shouldSendSnapshot: (info: {
    activeSnapshotId: string | null;
    snapshotUpdatesCount: number;
  }) => boolean;
  isValidClient: (
    signingPublicKey: string,
    publicData:
      | SnapshotPublicData
      | UpdatePublicData
      | EphemeralMessagePublicData
  ) => boolean | Promise<boolean>;
  serializeChanges: (changes: any[]) => string;
  deserializeChanges: (serializeChanges: string) => any;
  sodium: any;
  onDocumentUpdated?: (params: {
    type: OnDocumentUpdatedEventType;
    knownSnapshotInfo: SnapshotInfoWithUpdateClocks;
  }) => void | Promise<void>;
  onCustomMessage?: (message: any) => Promise<void> | void;
  loadDocumentParams?: LoadDocumentParams;
  additionalAuthenticationDataValidations?: AdditionalAuthenticationDataValidations;
  /** default: "off" */
  logging?: "off" | "error" | "debug";
};

export type CreateSnapshotParams = {
  snapshot: SnapshotWithClientData;
};

export type CreateUpdateParams = {
  update: Update;
};

export type GetDocumentMode = "complete" | "delta";

export type GetDocumentParams = {
  documentId: string;
  knownSnapshotId?: string;
  knownSnapshotUpdateClocks?: SnapshotUpdateClocks;
  mode: GetDocumentMode;
};

export type HasAccessParams =
  | {
      action: "read";
      documentId: string;
      websocketSessionKey: string | undefined;
    }
  | {
      action: "write-snapshot" | "write-update" | "send-ephemeral-message";
      documentId: string;
      publicKey: string;
      websocketSessionKey: string | undefined;
    };

export type HasBroadcastAccessParams = {
  documentId: string;
  websocketSessionKeys: string[];
};

export type ValidSessions = {
  [authorPublicKey: string]: { sessionId: string; sessionCounter: number };
};

export type EphemeralMessagesSession = {
  id: string;
  counter: number;
  validSessions: ValidSessions;
};

export type SnapshotProofChainEntry = {
  snapshotId: string;
  snapshotCiphertextHash: string;
  parentSnapshotProof: string;
};

export type SnapshotProofInfo = SnapshotProofChainEntry & {
  additionalPublicData: any;
};

export type SnapshotInfoWithUpdateClocks = SnapshotProofInfo & {
  updateClocks: SnapshotUpdateClocks;
};
