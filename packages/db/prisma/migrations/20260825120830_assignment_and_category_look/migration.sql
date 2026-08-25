-- AlterTable
ALTER TABLE "category" ADD COLUMN     "color" VARCHAR(32),
ADD COLUMN     "icon" VARCHAR(32);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- The unique index below is on the stored day, so without this the pair (category, month) is
-- unique per day and one category could hold two rows for the same month. Prisma has no way to
-- declare a check constraint, so it lives here and nowhere else. The day is read with EXTRACT
-- rather than compared against date_trunc: on a date argument that one resolves to the
-- timestamptz overload, which is STABLE, and Postgres takes a check condition to be immutable.
-- `isfinite` carries its weight: EXTRACT answers NULL on an infinite date, and a check passes on
-- NULL, so without it a row belonging to no month at all would be storable.
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_month_is_first_of_month" CHECK (isfinite("month") AND EXTRACT(DAY FROM "month") = 1);

-- CreateIndex
CREATE INDEX "assignment_user_id_budget_id_month_idx" ON "assignment"("user_id", "budget_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_category_id_month_key" ON "assignment"("category_id", "month");

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_budget_id_user_id_fkey" FOREIGN KEY ("budget_id", "user_id") REFERENCES "budget"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_category_id_budget_id_fkey" FOREIGN KEY ("category_id", "budget_id") REFERENCES "category"("id", "budget_id") ON DELETE RESTRICT ON UPDATE CASCADE;
