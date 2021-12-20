import { prisma } from "./prisma";

export async function getDocumentPreviewsByIds(documentIds: string[]) {
  return await prisma.document.findMany({
    where: { id: { in: documentIds } },
    include: { activeSnapshot: true },
  });
}
