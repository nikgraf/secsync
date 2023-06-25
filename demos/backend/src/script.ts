// import { createUpdate } from "./database/createUpdate";
// import { getDocument } from "./database/getDocument";
// import { getUpdatesForDocument } from "./database/getUpdatesForDocument";
import { prisma } from "./database/prisma";

async function main() {
  // const document = await prisma.document.upsert({
  //   where: {
  //     id: "ea94bbf3-2876-42e4-afaa-5dda408a22c0",
  //   },
  //   create: {
  //     id: "ea94bbf3-2876-42e4-afaa-5dda408a22c0",
  //   },
  //   update: {},
  // });
  // console.log(document);
  // const snapshot = await prisma.snapshot.create({
  //   data: {
  //     latestVersion: 0,
  //     preview: "aaa",
  //     data: "bbb",
  //     activeSnapshotDocument: {
  //       connect: { id: "ea94bbf3-2876-42e4-afaa-5dda408a22c0" },
  //     },
  //     document: { connect: { id: "ea94bbf3-2876-42e4-afaa-5dda408a22c0" } },
  //   },
  // });
  // console.log("snapshot", snapshot);
  // const a = await createUpdate(snapshot.id);
  // const b = await createUpdate(snapshot.id);
  // const c = await createUpdate(snapshot.id);
  // console.log(a, b, c);
  // const documentResult = await getDocument(
  //   "ea94bbf3-2876-42e4-afaa-5dda408a22c0"
  // );
  // console.log(documentResult);
  // const updatesA = await getUpdatesForDocument(
  //   "ea94bbf3-2876-42e4-afaa-5dda408a22c0",
  //   snapshot.id,
  //   1
  // );
  // console.log("a", updatesA);
  // const updatesB = await getUpdatesForDocument(
  //   "ea94bbf3-2876-42e4-afaa-5dda408a22c0",
  //   snapshot.id,
  //   2
  // );
  // console.log("b", updatesB);
  // const updatesC = await getUpdatesForDocument(
  //   "ea94bbf3-2876-42e4-afaa-5dda408a22c0",
  //   "something",
  //   2
  // );
  // console.log("c", updatesC);
}

main()
  .catch((e) => {
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
