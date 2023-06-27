-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "activeSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "latestVersion" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clocks" JSONB NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Update" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "pubKey" TEXT NOT NULL,

    CONSTRAINT "Update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_activeSnapshotId_key" ON "Document"("activeSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "Update_snapshotId_version_key" ON "Update"("snapshotId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Update_snapshotId_pubKey_snapshotVersion_key" ON "Update"("snapshotId", "pubKey", "snapshotVersion");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_activeSnapshotId_fkey" FOREIGN KEY ("activeSnapshotId") REFERENCES "Snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Update" ADD CONSTRAINT "Update_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
