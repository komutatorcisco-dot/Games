# Stage two: server economy pilot (disabled)

This branch builds on PR #4 and reuses its verified D1 staging database. It does not
modify `server/worker.js`, production D1, the production deployment workflow, or any
real player's wallet. No new Worker or Telegram webhook has been deployed.

## Implemented

- Separate `server/economy/worker.mjs`, authenticated with Telegram initData (one-hour
  age limit), a staging environment gate and an explicit user allowlist. Both server
  and client feature flags default off. Public routes cannot accept balances, inventory,
  trophies, match outcomes or arbitrary grants as authority.
- Wallets and inventories with strict integer/range checks (trophies capped at 11,000),
  lifetime received and spent copies, immutable opening evidence, operations, claims
  and per-asset ledger rows. Operator-approved migration is separate from HTTP routes.
- Optimistic revision checks inside a D1 batch. A zero-row wallet UPDATE deliberately
  causes a CHECK error, aborting the entire transaction. Operations, wallet, inventory,
  claims and ledger commit together. Unique transaction IDs and request hashes reject
  changed-payload replays; accepted requests always return their persisted pack result.
- Coin shop, all existing SBC definitions (including weekly/day boundaries and ten-stage
  Espart group), verified reward entitlements and new Stars pack/coin orders. Server
  receipts, never the browser's invoice callback, permit Stars delivery. `/stars/restore`
  replays the original result. Existing legacy purchases are never fresh entitlements.
- Catalog and SBC definitions generated from existing client sources. Pack slot odds,
  rating decay, 35% fresh-card preference, guarantees, duplicates and coin prices match
  the existing game. Seeded parity tests compare the two implementations directly.
- Small opt-in adapters in the existing coin/Stars shop and SBC submit path. Existing
  `PackOpen.reveal` renders server results. Pending request IDs survive reload and a
  lost response; staging uses a separate local save and disables legacy server/Telegram
  cloud saves. Legacy API traffic is redirected to the isolated Worker, never production.
  Revisions prevent an older response overwriting newer displayed state.

## Correction to the stage-one audit

The stage-one VM omitted `js/data/faces2.js` and the `FACES_EXTRA` merge normally performed
by the client. It incorrectly reported 1,619 distinct owned keys as unknown across 360 saves.
Loading the full catalog resolves **all** of these keys exactly. The full catalog contains
5,072 card entries. No fuzzy renaming, deletions, balance resets or compensation occurred.
The corrected baseline is 543 players: 541 pending explicit review, two with payment
reconciliation findings, zero activated. Pending is not proof that balances are trustworthy.

`tools/economy-history.mjs` inspected 22 evaluable historical catalog revisions, including
revisions introducing and modifying SBC. The Espart key remains `FS:xavi-espart`; periodic
SBC completion IDs are preserved during review. `reconcile.mjs` retains original source
bytes, received/spent counts and unresolved items. Future aliases require an explicit
reviewed target and repository evidence commit; no similarity-based matching occurs.
Unknown items block activation while their original evidence remains preserved.

The payment finding concerns **three purchase rows belonging to two players**: two 100-Star
passes and one 99-Star Jackson pack. The export contains zero payment receipt rows. Both
passes have matching season/premium state in saved progress; the pack has a matching paid
marker. This corroborates previous delivery but client save markers are not payment proof.
Preserve the server purchase records and complete raw saves; do not re-grant them. A fresh
v2 order and matching receipt are mandatory for any new server Stars reward. Telegram's
historical transaction/refund records have not been queried by this stage.

## Validation performed

2026-10-11, existing `jackson-economy-staging-20261011`:

- Applied `002-economy.sql` only after checking the staging UUID/name against a fixed
  allowlist and rejecting the production UUID. Existing legacy/shadow tables were retained.
- Ran the same integration suite against real remote D1 REST batches and local SQLite.
  Competing spends across two devices, same-ID pack races, response-loss recovery,
  conflicting replays, duplicate SBC spends, repeat reward claims, trophy cap, receipt
  tampering, receipt replay/restore, immutable history, fractional amounts and mid-batch
  rollback all passed. Signed Worker HTTP handlers used this remote D1 adapter too.
- Explicit reviewed migration was tested on synthetic accounts only, preserving spent
  cards and completed SBC IDs and refusing historical Stars re-grants.
- Client VM tests exercised signed Worker requests, forged localStorage balances/inventory,
  and a disconnect after commit followed by replay of the persisted request ID.
- Pack RNG parity and current SBC requirement/reward parity passed. All existing non-browser
  Node tests and Python backup tests passed locally. Wrangler dry-run bundled the separate
  Worker successfully. Browser regressions run in the PR's CI.

Remote reports and fixtures are in ignored `private-economy/`; no credentials or real
save payloads belong in this PR. Synthetic accounts are high-numbered IDs and have no
Telegram recipients. The actual Worker runtime has not been deployed, and no real Stars
payment has been made. REST batch tests do not substitute for a deployed binding/payment
end-to-end pilot. Ordinary clients remain on the existing economy with flags disabled.

## Run and review

Node 24 and Python 3.12+, from the repository root:

```sh
node tools/economy-catalog.mjs
node tests/economy-rules.test.js
node tests/economy-stage-two.test.js
node tests/economy-client.test.js
node tests/economy-migration.test.js
python tests/economy-backup_test.py
```

For the existing staging DB, authenticate Wrangler with D1 access and set
`ECONOMY_WRANGLER_AUTH` to its local OAuth TOML path (never paste its contents).
`node tools/economy-stage-two-remote.mjs` checks the fixed staging identity and writes only
synthetic test accounts plus append-only test history. `--apply` is for the FIRST schema
installation only and refuses existing `econ_` tables; it has already been applied here.

Use `wrangler.economy-staging.toml` for dry-run/bundling. A future isolated Worker pilot needs
Workers deployment permission and a **dedicated test Telegram bot**, with BOT_TOKEN and
ECONOMY_WEBHOOK_SECRET stored as secrets. Do not reuse/change the production bot webhook.
Set ECONOMY_ENABLED=true and ECONOMY_TEST_UIDS to explicit test users only in that pilot.
A private client build then sets CONFIG.economyStaging=true and CONFIG.economyApi to that
Worker's URL. Client flags never authorize a user on the server. Test accounts must first
have an operator-created reviewed wallet (no public activation or seed endpoint).

## Controlled migration and remaining release gates

1. Keep flags off for ordinary users. Review this PR stacked on PR #4. Retain the original
   verified export; obtain a fresh read-only snapshot before any eventual migration.
2. Deploy only the separate pilot Worker and dedicated test bot. Exercise real D1 bindings,
   pre-checkout, successful payment, reconnect and two real test devices. Resolve duplicate
   charge/refund handling operationally; this PR rejects conflicting receipts for review.
3. Connect authoritative match/draft outcomes and remaining reward producers to `entitle`.
   Legacy `/save`, game results, browser storage and premium flags must never create an
   entitlement. Gallery purchases, free drops, pass/skin rewards and draft settlement are
   not switched to server authority in this slice. They must be migrated or disabled in
   the pilot before testing a fully authoritative account across all screens.
4. Reconcile device saves by explicit evidence review, not maximum/newest balance. Preserve
   every source. `activateReviewed` requires the exact reviewed hash and reviewer identity,
   preserves completed SBC claims and creates an immutable opening snapshot atomically.
   No real account was activated by this PR. Do not roll an activated account back to a
   writable legacy economy: pause new spending and preserve its ledger instead.
5. After separate owner approval, start a small allowlisted cohort, monitor ledger equality,
   idempotency conflicts and delivery failures, then widen the cohort. Production activation
   additionally requires a deliberate environment/config rollout; this Worker currently
   refuses non-staging environments. No automated production migration is provided.

This is an operational staging slice, not a claim that every legacy economic exploit is
already closed. Loading-speed optimization remains outside this PR.
