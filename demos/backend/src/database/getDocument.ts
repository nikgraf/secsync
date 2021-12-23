import { prisma } from "./prisma";
import { serializeSnapshot, serializeUpdates } from "../utils/serialize";

export async function getDocument(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      activeSnapshot: {
        include: { updates: { orderBy: { version: "asc" } } },
      },
    },
  });
  if (!doc) return null;

  const snapshot = doc.activeSnapshot
    ? serializeSnapshot(doc.activeSnapshot)
    : null;

  const updates = doc.activeSnapshot
    ? serializeUpdates(doc.activeSnapshot.updates)
    : [];

  return {
    doc: { id: doc.id },
    snapshot,
    updates,
  };
}
