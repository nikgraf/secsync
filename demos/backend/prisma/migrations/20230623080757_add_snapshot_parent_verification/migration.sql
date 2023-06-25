/*
  Warnings:

  - You are about to drop the column `preview` on the `Snapshot` table. All the data in the column will be lost.
  - Added the required column `parentSnapshotClocks` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `parentSnapshotProof` to the `Snapshot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Snapshot" DROP COLUMN "preview",
ADD COLUMN     "parentSnapshotClocks" JSONB NOT NULL,
ADD COLUMN     "parentSnapshotProof" TEXT NOT NULL;
