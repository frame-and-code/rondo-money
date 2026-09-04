-- CreateTable
CREATE TABLE "category_paid_month" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_paid_month_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_paid_month_user_id_budget_id_month_idx" ON "category_paid_month"("user_id", "budget_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "category_paid_month_category_id_month_key" ON "category_paid_month"("category_id", "month");

-- AddForeignKey
ALTER TABLE "category_paid_month" ADD CONSTRAINT "category_paid_month_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_paid_month" ADD CONSTRAINT "category_paid_month_category_id_budget_id_fkey" FOREIGN KEY ("category_id", "budget_id") REFERENCES "category"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The unique index above is on the stored day, so without this a category could carry two
-- marks for one month. The column is read with EXTRACT rather than compared against
-- date_trunc, for the reason category_target's constraints give, and `isfinite` keeps a row
-- belonging to no month at all from being storable.
ALTER TABLE "category_paid_month" ADD CONSTRAINT "category_paid_month_month_is_first_of_month" CHECK (isfinite("month") AND EXTRACT(DAY FROM "month") = 1);
