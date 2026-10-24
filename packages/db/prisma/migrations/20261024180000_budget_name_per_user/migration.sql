-- A caller's budgets carry different names, compared without regard to case. Names already
-- sharing one are told apart first, by the random tail of the row id, so the index can be
-- built. The name is cut to 45 characters so the result stays within the 60 the API accepts.
UPDATE "budget" AS "b"
SET "name" = rtrim(left("b"."name", 45)) || ' (' || right("b"."id"::text, 12) || ')'
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "user_id", lower("name") ORDER BY "created_at", "id") AS "n"
  FROM "budget"
) AS "d"
WHERE "b"."id" = "d"."id" AND "d"."n" > 1;

CREATE UNIQUE INDEX "budget_name_per_user" ON "budget" ("user_id", lower("name"));
