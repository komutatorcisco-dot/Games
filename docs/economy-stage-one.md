# Stage 1: preserve evidence before changing authority

Branch: `codex/economy-shadow-foundation`, based on production `fd49a6b`.
Reviewed PR #2 (merged) and PR #3 (architecture commit `4331984`).
The original dirty checkout remains in `../Games`; all development is in `Games-economy`.
Production contains the previous SBC, gallery/shop balance, Stars validation, draft chemistry,
presence quota and pack performance changes. PR #2's newer notification, webhook,
matchmaking, tracking and mobile readability changes are retained.

## Delivered

- `tools/economy-backup.py`: restore a supplied D1 SQL export into a **new local** SQLite file,
  check integrity/FKs, compare schema and per-table row fingerprints. Refuses overwrite,
  external attachments and extension loading. Prints counts/hashes, never player payloads.
- `tools/economy-review.mjs`: read the restored database read-only, include players found only
  in payment tables, and create a **separate new local shadow database**. Catalog is derived
  from the current game (3,454 keys at this revision), not an invented player list.
- `server/economy/migration-preview.mjs`: validate legacy evidence; compare economic fields
  across sources without selecting the biggest/newest balance; reconcile receipts/purchases.
  Both `pending` and `review` require human reconciliation. Neither activates server authority.
- `server/economy/staging/001-shadow.sql`: append-only source snapshots and review history,
  with request-hash idempotency. This is not loaded by the production Worker.
- Automated tests for restored data, unsafe SQL, source conflicts, malformed input,
  spent inventory, replay/conflicting replay, concurrent replay, transaction failure,
  orphan/mismatched payments and payment-only players.

No client code, runtime routes, existing tables, deployment workflow or balances changed.
No production backup has been taken by this PR. No remote D1 has been provisioned or tested.
Local tests simulate D1 `batch`; they are **not** proof of remote D1 behavior.

## Corrections to PR #3's proposal

1. One `econ_migrations` row per uid loses multiple-device provenance. Keep all exact source
   strings plus hashes and append review decisions. Malformed JSON is evidence too.
2. SQLite `INTEGER` affinity alone permits fractional values: use STRICT or `typeof(...)`
   checks plus JS safe-integer validation. Do not round dubious balances into accepted values.
3. `imported_ms NOT NULL` misrepresents pending snapshots; importing is a later, explicit event.
4. D1 saves are uploaded client JSON, not verified balances. A signed Telegram identity does
   not make `coins`, `paid`, `cards` or reported wins authoritative.
5. The demo transaction's zero-row UPDATE is not an SQL error. In D1 `batch`, subsequent
   unconditional credits would still execute. Future valuable operations need SQL guards
   that abort the whole batch or condition every write, plus staging concurrency tests.
6. Two-user transfers need an operation identity covering both parties; a per-owner ledger
   constraint alone does not prove sender debit and recipient credit happened together.
7. Receipts identify payment, not whether old clients already granted cards. Never blindly
   re-grant every receipt. Preserve historical purchases without receipts for review.
8. Entitlements must reference their granting operation; catalog/reward versions and
   immutable pack results must be persisted before turning on server-authoritative spending.

The proposed wallet/ledger SQL is therefore deliberately not installed in this stage.

## Backup and staging drill (operator runbook)

Prerequisites: Cloudflare access scoped to the correct account, actual production D1 ID/name,
separate staging D1 ID/name, and a private location for exports. Never paste tokens or player
exports into a PR. `private-economy/` is gitignored but is not encrypted storage.

1. Identify the production DB binding from Cloudflare; record ID, export time, app revision
   and current Time Travel bookmark outside the public repository. Do not guess the database.
2. Export production read-only with Wrangler:

   ```text
   npx wrangler d1 export <verified-production-db> --remote --output=private-economy/export.sql
   python tools/economy-backup.py --export private-economy/export.sql --new-local-db private-economy/restored.sqlite
   node tools/economy-review.mjs private-economy/restored.sqlite private-economy/shadow.sqlite
   ```

   Retain the original export and hash report securely. A successful local restore is only
   one checkpoint, not a verified production backup policy. Large databases may require
   a streaming tool: this initial verifier restores in memory and hashes/sorts table rows.
3. Provision a new, distinct, non-public staging D1; independently compare its UUID with the
   production UUID before **any import**. Do not reuse the production Worker or bot secrets.
4. Restore that export into staging, run integrity/FK checks and compare every table's
   row count/content fingerprints with the local restore. Restrict staging access because
   it contains real user data. Never attach a live Telegram webhook or scheduled mailings.
5. Only in the separate staging DB apply `server/economy/staging/001-shadow.sql` once.
   Re-run preview replay/conflict/rollback tests through real D1 `batch`.
   This SQL intentionally fails if applied twice; it never drops existing tables.
6. Capture results of the actual restore and remote tests. Until then, no player activation
   or valuable operations are eligible for production rollout.

Official references:
- https://developers.cloudflare.com/d1/best-practices/import-export-data/
- https://developers.cloudflare.com/d1/reference/time-travel/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

## Release boundary and next stage

This PR can be reviewed as offline tooling; merging it does not deploy economy routes or
run migrations. Production data changes and major releases still require owner confirmation.
Next: complete the real backup/staging drill, establish verified payment/catalog facts,
then implement the transaction ledger and persisted pack rewards in staging. Do not treat
this PR as closing client-side economic exploits. Server rewards, SBC spending, gifts,
match verification, client integration and performance baselines remain future stages.

Progress preservation and distrust of legacy client balances cannot be solved by choosing
an automatic maximum. Disputed snapshots stay intact while an explicit reconciliation
policy is agreed; no data is deleted or silently reduced here.
