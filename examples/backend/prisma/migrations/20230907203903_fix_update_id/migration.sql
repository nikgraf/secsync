/*
  Warnings:

  - The primary key for the `Update` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Update` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Update_snapshotId_version_key";

-- AlterTable
ALTER TABLE "Update" DROP CONSTRAINT "Update_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Update_pkey" PRIMARY KEY ("snapshotId", "version");
