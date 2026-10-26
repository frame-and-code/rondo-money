\set ON_ERROR_STOP on

\if :{?owner}
\else
  \set owner user_synth_owner
\endif

\set volume_name 'Synthetic volume'

BEGIN;

CREATE TEMP TABLE volume_doomed ON COMMIT DROP AS
SELECT id
FROM budget
WHERE (user_id = :'owner' AND lower(name) = lower(:'volume_name'))
   OR starts_with(user_id, 'user_synth_');

DELETE FROM "transaction" WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM assignment WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM category_target WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM category_paid_month WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM category WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM category_group WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM account WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM asset WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM liability WHERE budget_id IN (SELECT id FROM volume_doomed);
DELETE FROM budget WHERE id IN (SELECT id FROM volume_doomed);

\if :{?clean}
COMMIT;
\echo 'The synthetic volume is gone.'
\quit
\endif

CREATE TEMP TABLE volume_window ON COMMIT DROP AS
SELECT
  (date_trunc('month', current_date::timestamp) - interval '59 months')::date AS first_day,
  current_date - 1 AS last_day;

CREATE TEMP TABLE volume_budget ON COMMIT DROP AS
SELECT
  uuidv7() AS id,
  :'owner'::text AS user_id,
  50000 AS records,
  10 AS groups,
  6 AS per_group,
  6 AS open_accounts,
  2 AS archived_accounts
UNION ALL
SELECT uuidv7(), 'user_synth_' || lpad(n::text, 3, '0'), 10000, 3, 5, 3, 0
FROM generate_series(1, 50) AS n;

INSERT INTO budget (id, user_id, name, currency, minor_digits, timezone, active, created_at, updated_at)
SELECT
  b.id,
  b.user_id,
  :'volume_name',
  'PLN',
  2,
  'Europe/Warsaw',
  NOT EXISTS (SELECT 1 FROM budget o WHERE o.user_id = b.user_id AND o.active),
  w.first_day::timestamp,
  now()
FROM volume_budget b
CROSS JOIN volume_window w;

CREATE TEMP TABLE volume_group ON COMMIT DROP AS
SELECT uuidv7() AS id, b.id AS budget_id, b.user_id, g AS idx, g = 9 AS hidden
FROM volume_budget b, generate_series(0, b.groups - 1) AS g;

INSERT INTO category_group (id, user_id, budget_id, name, sort_order, hidden_at, created_at, updated_at)
SELECT
  g.id,
  g.user_id,
  g.budget_id,
  'Group ' || g.idx,
  g.idx,
  CASE WHEN g.hidden THEN w.first_day::timestamp END,
  w.first_day::timestamp,
  now()
FROM volume_group g
CROSS JOIN volume_window w;

CREATE TEMP TABLE volume_category ON COMMIT DROP AS
SELECT uuidv7() AS id, g.budget_id, g.user_id, g.id AS group_id, g.idx * b.per_group + c AS idx
FROM volume_group g
JOIN volume_budget b ON b.id = g.budget_id,
  generate_series(0, b.per_group - 1) AS c;

INSERT INTO category (id, user_id, budget_id, group_id, name, sort_order, hidden_at, created_at, updated_at)
SELECT
  c.id,
  c.user_id,
  c.budget_id,
  c.group_id,
  'Category ' || c.idx,
  c.idx,
  CASE WHEN c.idx % 17 = 16 THEN w.first_day::timestamp END,
  w.first_day::timestamp,
  now()
FROM volume_category c
CROSS JOIN volume_window w;

CREATE TEMP TABLE volume_account ON COMMIT DROP AS
SELECT uuidv7() AS id, b.id AS budget_id, b.user_id, a AS idx, a >= b.open_accounts AS archived
FROM volume_budget b, generate_series(0, b.open_accounts + b.archived_accounts - 1) AS a;

INSERT INTO account (id, user_id, budget_id, name, type, archived_at, created_at, updated_at)
SELECT
  a.id,
  a.user_id,
  a.budget_id,
  'Account ' || a.idx,
  (CASE WHEN a.idx % 2 = 0 THEN 'DEBIT' ELSE 'CASH' END)::account_type,
  CASE WHEN a.archived THEN w.last_day::timestamp END,
  w.first_day::timestamp,
  now()
FROM volume_account a
CROSS JOIN volume_window w;

INSERT INTO "transaction" (id, user_id, budget_id, account_id, date, amount, type, is_system, created_at, updated_at)
SELECT
  uuidv7(),
  a.user_id,
  a.budget_id,
  a.id,
  w.first_day,
  CASE WHEN a.archived THEN 0 ELSE 500000 END,
  'INCOME',
  true,
  w.first_day::timestamp,
  now()
FROM volume_account a
CROSS JOIN volume_window w;

CREATE TEMP TABLE volume_record ON COMMIT DROP AS
SELECT
  b.id AS budget_id,
  b.user_id,
  n,
  w.first_day + ((n::bigint * (w.last_day - w.first_day)) / b.records)::int AS day,
  n % b.open_accounts AS account_idx,
  (n * 7919) % (b.groups * b.per_group) AS category_idx,
  b.open_accounts,
  CASE
    WHEN n % 10 = 0 THEN 'TRANSFER'
    WHEN n % 10 = 1 THEN 'INCOME'
    WHEN n % 97 = 2 THEN 'ADJUSTMENT'
    ELSE 'EXPENSE'
  END AS kind,
  uuidv7() AS transfer_id
FROM volume_budget b
CROSS JOIN volume_window w,
  generate_series(1, b.records) AS n;

INSERT INTO "transaction" (id, user_id, budget_id, account_id, category_id, date, amount, type, payee, is_system, created_at, updated_at)
SELECT
  uuidv7(),
  r.user_id,
  r.budget_id,
  a.id,
  CASE WHEN r.kind = 'EXPENSE' THEN c.id END,
  r.day,
  CASE r.kind
    WHEN 'INCOME' THEN 40000 + (r.n * 37) % 20000
    WHEN 'ADJUSTMENT' THEN (r.n % 2 * 2 - 1) * (100 + r.n % 900)
    ELSE -(500 + (r.n * 31) % 9500)
  END,
  r.kind::transaction_type,
  CASE WHEN r.kind = 'EXPENSE' THEN 'Payee ' || (r.n * 13) % 200 END,
  false,
  r.day::timestamp + make_interval(secs => r.n % 50000),
  now()
FROM volume_record r
JOIN volume_account a ON a.budget_id = r.budget_id AND a.idx = r.account_idx
JOIN volume_category c ON c.budget_id = r.budget_id AND c.idx = r.category_idx
WHERE r.kind <> 'TRANSFER';

INSERT INTO "transaction" (id, user_id, budget_id, account_id, date, amount, type, transfer_id, is_system, created_at, updated_at)
SELECT
  uuidv7(),
  r.user_id,
  r.budget_id,
  a.id,
  r.day,
  leg.sign * (2000 + (r.n * 17) % 30000),
  'TRANSFER',
  r.transfer_id,
  false,
  r.day::timestamp + make_interval(secs => r.n % 50000),
  now()
FROM volume_record r
CROSS JOIN (VALUES (-1, 0), (1, 1)) AS leg (sign, shift)
JOIN volume_account a
  ON a.budget_id = r.budget_id AND a.idx = (r.account_idx + leg.shift) % r.open_accounts
WHERE r.kind = 'TRANSFER';

INSERT INTO assignment (id, user_id, budget_id, category_id, month, amount, created_at, updated_at)
SELECT
  uuidv7(),
  c.user_id,
  c.budget_id,
  c.id,
  m::date,
  1000 + (c.idx * 131 + extract(month FROM m)::int * 17) % 20000,
  m,
  now()
FROM volume_category c
CROSS JOIN volume_window w,
  generate_series(
    w.first_day::timestamp,
    date_trunc('month', w.last_day::timestamp) + interval '1 month',
    interval '1 month'
  ) AS m;

INSERT INTO category_target (id, user_id, budget_id, category_id, kind, amount, start_month, due_month, created_at, updated_at)
SELECT
  uuidv7(),
  c.user_id,
  c.budget_id,
  c.id,
  (ARRAY['REFILL_TO', 'CONTRIBUTE', 'BY_DATE', 'ACCUMULATE'])[c.idx % 4 + 1]::target_kind,
  10000 + (c.idx * 97) % 90000,
  (w.first_day + make_interval(months => 1 + c.idx % 24))::date,
  CASE WHEN c.idx % 4 = 2 THEN (date_trunc('month', w.last_day::timestamp) + interval '6 months')::date END,
  w.first_day::timestamp,
  now()
FROM volume_category c
CROSS JOIN volume_window w;

INSERT INTO category_target (id, user_id, budget_id, category_id, kind, amount, start_month, end_month, created_at, updated_at)
SELECT
  uuidv7(),
  c.user_id,
  c.budget_id,
  c.id,
  'CONTRIBUTE',
  5000,
  w.first_day,
  (w.first_day + make_interval(months => c.idx % 24))::date,
  w.first_day::timestamp,
  now()
FROM volume_category c
CROSS JOIN volume_window w
WHERE c.idx % 5 = 0;

INSERT INTO category_paid_month (id, user_id, budget_id, category_id, month, created_at)
SELECT uuidv7(), c.user_id, c.budget_id, c.id, m::date, m
FROM volume_category c
CROSS JOIN volume_window w,
  generate_series(
    w.first_day::timestamp,
    date_trunc('month', w.last_day::timestamp),
    interval '1 month'
  ) AS m
WHERE c.idx % 3 = 0;

INSERT INTO asset (id, user_id, budget_id, name, amount, date, created_at, updated_at)
SELECT
  uuidv7(),
  b.user_id,
  b.id,
  'Asset ' || i,
  1000000 * i,
  CASE WHEN i % 2 = 0 THEN w.last_day END,
  w.first_day::timestamp,
  now()
FROM volume_budget b
CROSS JOIN volume_window w,
  generate_series(1, 5) AS i;

INSERT INTO liability (id, user_id, budget_id, name, amount, date, created_at, updated_at)
SELECT
  uuidv7(),
  b.user_id,
  b.id,
  'Liability ' || i,
  250000 * i,
  CASE WHEN i % 2 = 1 THEN w.last_day END,
  w.first_day::timestamp,
  now()
FROM volume_budget b
CROSS JOIN volume_window w,
  generate_series(1, 5) AS i;

COMMIT;

VACUUM ANALYZE budget, category_group, category, account, "transaction", assignment, category_target, category_paid_month, asset, liability;

SELECT
  b.user_id AS owner,
  b.active,
  (SELECT count(*) FROM "transaction" t WHERE t.budget_id = b.id) AS records,
  (SELECT count(*) FROM "transaction" t WHERE starts_with(t.user_id, 'user_synth_') AND t.user_id <> b.user_id) AS background
FROM budget b
WHERE b.user_id = :'owner' AND b.name = :'volume_name';
