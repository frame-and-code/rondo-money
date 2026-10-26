-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_category_id_date_amount_idx" ON "transaction"("user_id", "budget_id", "category_id", "date", "amount");

-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_account_id_is_system_amount_idx" ON "transaction"("user_id", "budget_id", "account_id", "is_system", "amount");

-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_payee_date_created_at_idx" ON "transaction"("user_id", "budget_id", "payee", "date", "created_at");

-- CreateIndex
CREATE INDEX "transaction_user_id_budget_id_type_date_created_at_idx" ON "transaction"("user_id", "budget_id", "type", "date", "created_at");

-- CreateIndex
CREATE INDEX "transaction_typed_payees_idx" ON "transaction"("user_id", "budget_id", "payee") WHERE ("payee" IS NOT NULL AND "transfer_id" IS NULL AND "is_system" = false);

-- A budget belongs to one owner, so a filter on both user_id and budget_id selects no fewer
-- rows than the filter on budget_id alone. Postgres assumes the two columns are independent
-- unless a statistic says otherwise, and then expects a fraction of the rows a budget holds and
-- plans its joins for that. Prisma cannot declare a statistic, so these live in this
-- migration alone.
CREATE STATISTICS "category_group_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "category_group";
CREATE STATISTICS "category_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "category";
CREATE STATISTICS "account_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "account";
CREATE STATISTICS "transaction_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "transaction";
CREATE STATISTICS "assignment_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "assignment";
CREATE STATISTICS "category_target_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "category_target";
CREATE STATISTICS "category_paid_month_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "category_paid_month";
CREATE STATISTICS "asset_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "asset";
CREATE STATISTICS "liability_user_id_budget_id_stat" (dependencies) ON "user_id", "budget_id" FROM "liability";

ANALYZE "category_group", "category", "account", "transaction", "assignment", "category_target", "category_paid_month", "asset", "liability";
