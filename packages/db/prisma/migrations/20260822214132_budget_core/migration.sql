-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('CASH', 'DEBIT');

-- CreateEnum
CREATE TYPE "transaction_type" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "budget" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minor_digits" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_group" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "hidden_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "account_type" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "type" "transaction_type" NOT NULL,
    "transfer_id" UUID,
    "payee" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_user_id_idx" ON "budget"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_one_active_per_user" ON "budget"("user_id", "active") WHERE ("active" = true);

-- CreateIndex
CREATE INDEX "category_group_user_id_budget_id_idx" ON "category_group"("user_id", "budget_id");

-- CreateIndex
CREATE INDEX "category_user_id_budget_id_idx" ON "category"("user_id", "budget_id");

-- CreateIndex
CREATE INDEX "category_group_id_idx" ON "category"("group_id");

-- CreateIndex
CREATE INDEX "account_user_id_budget_id_idx" ON "account"("user_id", "budget_id");

-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_date_idx" ON "transaction"("user_id", "budget_id", "date");

-- CreateIndex
CREATE INDEX "transaction_account_id_idx" ON "transaction"("account_id");

-- CreateIndex
CREATE INDEX "transaction_category_id_idx" ON "transaction"("category_id");

-- CreateIndex
CREATE INDEX "transaction_transfer_id_idx" ON "transaction"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_user_id_key_key" ON "idempotency_key"("user_id", "key");

-- AddForeignKey
ALTER TABLE "category_group" ADD CONSTRAINT "category_group_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "category_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
