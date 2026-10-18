-- PROPOSAL ONLY. NOT an executable production migration.
-- Validated against in-memory SQLite 3 with constraint tests on 2026-10-11.
-- Cloudflare D1 staging must verify query API and transaction behavior before applying.
CREATE TABLE IF NOT EXISTS econ_accounts (
  uid INTEGER PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0),
  trophies INTEGER NOT NULL DEFAULT 0 CHECK(trophies BETWEEN 0 AND 11000),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  authority TEXT NOT NULL DEFAULT 'legacy' CHECK(authority IN ('legacy','shadow','server')),
  updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS econ_inventory (
  uid INTEGER NOT NULL,
  card_key TEXT NOT NULL,
  owned_total INTEGER NOT NULL DEFAULT 0 CHECK(owned_total >= 0),
  consumed_total INTEGER NOT NULL DEFAULT 0 CHECK(consumed_total >= 0),
  PRIMARY KEY(uid, card_key),
  FOREIGN KEY(uid) REFERENCES econ_accounts(uid),
  CHECK(consumed_total <= owned_total)
);
CREATE TABLE IF NOT EXISTS econ_entitlements (
  uid INTEGER NOT NULL,
  entitlement_type TEXT NOT NULL,
  entitlement_key TEXT NOT NULL,
  source_action TEXT NOT NULL,
  granted_ms INTEGER NOT NULL,
  PRIMARY KEY(uid, entitlement_type, entitlement_key),
  FOREIGN KEY(uid) REFERENCES econ_accounts(uid)
);
-- Store permanent idempotency results, especially for payments and high-value claims.
CREATE TABLE IF NOT EXISTS econ_actions (
  uid INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('applied','rejected')),
  result_json TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  PRIMARY KEY(uid, action_id),
  FOREIGN KEY(uid) REFERENCES econ_accounts(uid)
);
CREATE TABLE IF NOT EXISTS econ_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('coins','trophies','card','pass_xp','life')),
  asset_key TEXT NOT NULL DEFAULT '',
  delta INTEGER NOT NULL CHECK(delta <> 0),
  created_ms INTEGER NOT NULL,
  UNIQUE(uid, action_id, asset_type, asset_key),
  FOREIGN KEY(uid, action_id) REFERENCES econ_actions(uid, action_id)
);
CREATE TABLE IF NOT EXISTS econ_migrations (
  uid INTEGER PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('d1_save','telegram_cloud','local_only','none')),
  source_hash TEXT NOT NULL,
  snapshot_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','review')),
  imported_ms INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(uid) REFERENCES econ_accounts(uid)
);
CREATE TABLE IF NOT EXISTS econ_seasons (
  uid INTEGER NOT NULL,
  season INTEGER NOT NULL,
  pass_xp INTEGER NOT NULL DEFAULT 0 CHECK(pass_xp >= 0),
  PRIMARY KEY(uid, season),
  FOREIGN KEY(uid) REFERENCES econ_accounts(uid)
);
CREATE INDEX IF NOT EXISTS econ_ledger_uid_ms ON econ_ledger(uid, created_ms);
CREATE INDEX IF NOT EXISTS econ_action_created ON econ_actions(created_ms);
-- Existing payment_receipts and purchases tables remain; migration must reconcile
-- by unique telegram_payment_charge_id and never take paid status from local JSON.
-- econ_inventory.owned_total is lifetime gallery count; consumed_total accounts for
-- SBC submission and card transfers, so available = owned_total - consumed_total.
