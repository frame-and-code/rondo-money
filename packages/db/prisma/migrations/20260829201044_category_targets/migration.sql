-- CreateEnum
CREATE TYPE "target_kind" AS ENUM ('REFILL_TO', 'CONTRIBUTE', 'BY_DATE', 'ACCUMULATE');

-- CreateTable
CREATE TABLE "category_target" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "kind" "target_kind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "start_month" DATE NOT NULL,
    "due_month" DATE,
    "end_month" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_target_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_target_user_id_budget_id_idx" ON "category_target"("user_id", "budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_target_category_id_start_month_key" ON "category_target"("category_id", "start_month");

-- AddForeignKey
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_category_id_budget_id_fkey" FOREIGN KEY ("category_id", "budget_id") REFERENCES "category"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The unique index above is on the stored day, so without these a category could hold two
-- goals for the same month. The three columns are read with EXTRACT rather than compared
-- against date_trunc: on a date argument that one resolves to the timestamptz overload,
-- which is STABLE, and Postgres takes a check condition to be immutable. `isfinite` carries
-- its weight: EXTRACT answers NULL on an infinite date, and a check passes on NULL, so
-- without it a row belonging to no month at all would be storable. The two nullable columns
-- pass when they are absent, which is what a goal with no date and no closing month is.
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_start_month_is_first_of_month" CHECK (isfinite("start_month") AND EXTRACT(DAY FROM "start_month") = 1);
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_due_month_is_first_of_month" CHECK ("due_month" IS NULL OR (isfinite("due_month") AND EXTRACT(DAY FROM "due_month") = 1));
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_end_month_is_first_of_month" CHECK ("end_month" IS NULL OR (isfinite("end_month") AND EXTRACT(DAY FROM "end_month") = 1));

-- A goal of nothing would divide its own progress by zero, and a negative one would ask the
-- user to take money out to reach it.
ALTER TABLE "category_target" ADD CONSTRAINT "category_target_amount_is_positive" CHECK ("amount" > 0);
