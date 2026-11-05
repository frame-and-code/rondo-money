-- AlterTable
ALTER TABLE "category" ADD COLUMN     "default_account_id" UUID;

-- CreateIndex
CREATE INDEX "category_default_account_id_idx" ON "category"("default_account_id");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_default_account_id_budget_id_fkey" FOREIGN KEY ("default_account_id", "budget_id") REFERENCES "account"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;
