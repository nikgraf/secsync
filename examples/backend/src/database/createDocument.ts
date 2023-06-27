import { prisma } from "./prisma";

export async function createDocument(docId: string) {
  return await prisma.document.create({
    data: { id: docId },
  });
}
