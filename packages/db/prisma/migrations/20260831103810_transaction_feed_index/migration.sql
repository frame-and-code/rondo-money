-- DropIndex
DROP INDEX "transaction_account_id_idx";

-- DropIndex
DROP INDEX "transaction_user_id_budget_id_date_idx";

-- CreateIndex
CREATE INDEX "transaction_account_id_date_created_at_idx" ON "transaction"("account_id", "date", "created_at");

-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_date_created_at_idx" ON "transaction"("user_id", "budget_id", "date", "created_at");
