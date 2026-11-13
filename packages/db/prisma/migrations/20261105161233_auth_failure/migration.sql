-- CreateTable
CREATE TABLE "auth_failure" (
    "client_key" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL,

    CONSTRAINT "auth_failure_pkey" PRIMARY KEY ("client_key","window_start")
);

-- CreateIndex
CREATE INDEX "auth_failure_window_start_idx" ON "auth_failure"("window_start");
