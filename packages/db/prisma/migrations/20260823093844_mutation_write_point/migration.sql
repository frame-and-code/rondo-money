-- DropForeignKey
ALTER TABLE "account" DROP CONSTRAINT "account_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "category" DROP CONSTRAINT "category_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "category" DROP CONSTRAINT "category_group_id_fkey";

-- DropForeignKey
ALTER TABLE "category_group" DROP CONSTRAINT "category_group_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_account_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_category_id_fkey";

-- AlterTable
-- Added with a default and stripped of it again: a NOT NULL column cannot land on a table that
-- already holds rows. A row that takes the empty fallback can never be replayed afterwards,
-- since no request hashes to it, and the api refuses a key it cannot attribute.
ALTER TABLE "idempotency_key" ADD COLUMN "request_fingerprint" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "idempotency_key" ALTER COLUMN "request_fingerprint" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "account_id_budget_id_key" ON "account"("id", "budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_id_user_id_key" ON "budget"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_id_budget_id_key" ON "category"("id", "budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_group_id_budget_id_key" ON "category_group"("id", "budget_id");

-- AddForeignKey
ALTER TABLE "category_group" ADD CONSTRAINT "category_group_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_group_id_budget_id_fkey" FOREIGN KEY ("group_id", "budget_id") REFERENCES "category_group"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_budget_id_fkey" FOREIGN KEY ("account_id", "budget_id") REFERENCES "account"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_budget_id_fkey" FOREIGN KEY ("category_id", "budget_id") REFERENCES "category"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;
