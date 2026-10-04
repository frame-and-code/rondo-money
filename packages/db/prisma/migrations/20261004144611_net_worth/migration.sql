-- CreateTable
CREATE TABLE "asset" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liability" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_user_id_budget_id_idx" ON "asset"("user_id", "budget_id");

-- CreateIndex
CREATE INDEX "liability_user_id_budget_id_idx" ON "liability"("user_id", "budget_id");

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liability" ADD CONSTRAINT "liability_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asset" ADD CONSTRAINT "asset_amount_is_not_negative" CHECK ("amount" >= 0);
ALTER TABLE "liability" ADD CONSTRAINT "liability_amount_is_not_negative" CHECK ("amount" >= 0);
