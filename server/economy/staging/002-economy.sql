-- Apply ONLY to the verified staging database. No automatic migration on fetch.
CREATE TABLE econ_wallets (
 uid INTEGER PRIMARY KEY CHECK(uid>0), coins INTEGER NOT NULL CHECK(typeof(coins)='integer' AND coins BETWEEN 0 AND 1000000000000),
 trophies INTEGER NOT NULL CHECK(typeof(trophies)='integer' AND trophies BETWEEN 0 AND 11000),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0),
 activated_ms INTEGER NOT NULL, evidence TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('test','reviewed'))
);
CREATE TABLE econ_inventory (
 uid INTEGER NOT NULL REFERENCES econ_wallets(uid), card TEXT NOT NULL,
 received INTEGER NOT NULL CHECK(typeof(received)='integer' AND received BETWEEN 0 AND 1000000000),
 spent INTEGER NOT NULL CHECK(typeof(spent)='integer' AND spent BETWEEN 0 AND received), PRIMARY KEY(uid,card)
);
CREATE TABLE econ_operations (
 uid INTEGER NOT NULL REFERENCES econ_wallets(uid), id TEXT NOT NULL, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 kind TEXT NOT NULL, result TEXT NOT NULL CHECK(json_valid(result)), revision INTEGER NOT NULL,
 created_ms INTEGER NOT NULL, PRIMARY KEY(uid,id), UNIQUE(uid,revision)
);
CREATE TABLE econ_ledger (
 uid INTEGER NOT NULL, op TEXT NOT NULL, asset TEXT NOT NULL, delta INTEGER NOT NULL CHECK(typeof(delta)='integer'),
 spent_delta INTEGER NOT NULL CHECK(typeof(spent_delta)='integer' AND spent_delta>=0),
 PRIMARY KEY(uid,op,asset), FOREIGN KEY(uid,op) REFERENCES econ_operations(uid,id)
);
CREATE TABLE econ_claims (
 uid INTEGER NOT NULL, claim TEXT NOT NULL, op TEXT NOT NULL, PRIMARY KEY(uid,claim),
 FOREIGN KEY(uid,op) REFERENCES econ_operations(uid,id)
);
CREATE TABLE econ_assert (ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE econ_orders (
 id TEXT PRIMARY KEY, uid INTEGER NOT NULL REFERENCES econ_wallets(uid), item TEXT NOT NULL, stars INTEGER NOT NULL CHECK(typeof(stars)='integer' AND stars>0), created_ms INTEGER NOT NULL
);
CREATE TABLE econ_receipts (
 charge TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES econ_orders(id), uid INTEGER NOT NULL,
 stars INTEGER NOT NULL CHECK(typeof(stars)='integer' AND stars>0), created_ms INTEGER NOT NULL
);
CREATE TABLE econ_entitlements (
 uid INTEGER NOT NULL REFERENCES econ_wallets(uid), id TEXT NOT NULL, reward TEXT NOT NULL CHECK(json_valid(reward)),
 evidence TEXT NOT NULL, PRIMARY KEY(uid,id)
);
CREATE TABLE econ_legacy_evidence (
 uid INTEGER NOT NULL, source TEXT NOT NULL, digest TEXT NOT NULL, raw TEXT NOT NULL,
 PRIMARY KEY(uid,source,digest)
);
CREATE TRIGGER econ_ops_update BEFORE UPDATE ON econ_operations BEGIN SELECT RAISE(ABORT,'immutable operation'); END;
CREATE TRIGGER econ_ops_delete BEFORE DELETE ON econ_operations BEGIN SELECT RAISE(ABORT,'immutable operation'); END;
CREATE TRIGGER econ_ledger_update BEFORE UPDATE ON econ_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
CREATE TRIGGER econ_ledger_delete BEFORE DELETE ON econ_ledger BEGIN SELECT RAISE(ABORT,'immutable ledger'); END;
CREATE TRIGGER econ_claims_update BEFORE UPDATE ON econ_claims BEGIN SELECT RAISE(ABORT,'immutable claim'); END;
CREATE TRIGGER econ_claims_delete BEFORE DELETE ON econ_claims BEGIN SELECT RAISE(ABORT,'immutable claim'); END;
CREATE TRIGGER econ_receipts_update BEFORE UPDATE ON econ_receipts BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TRIGGER econ_receipts_delete BEFORE DELETE ON econ_receipts BEGIN SELECT RAISE(ABORT,'immutable receipt'); END;
CREATE TRIGGER econ_orders_update BEFORE UPDATE ON econ_orders BEGIN SELECT RAISE(ABORT,'immutable order'); END;
CREATE TRIGGER econ_orders_delete BEFORE DELETE ON econ_orders BEGIN SELECT RAISE(ABORT,'immutable order'); END;
CREATE TRIGGER econ_entitlements_update BEFORE UPDATE ON econ_entitlements BEGIN SELECT RAISE(ABORT,'immutable entitlement'); END;
CREATE TRIGGER econ_entitlements_delete BEFORE DELETE ON econ_entitlements BEGIN SELECT RAISE(ABORT,'immutable entitlement'); END;
CREATE TRIGGER econ_evidence_update BEFORE UPDATE ON econ_legacy_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TRIGGER econ_evidence_delete BEFORE DELETE ON econ_legacy_evidence BEGIN SELECT RAISE(ABORT,'immutable evidence'); END;
CREATE TABLE econ_openings (
 uid INTEGER PRIMARY KEY REFERENCES econ_wallets(uid), evidence TEXT NOT NULL, snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), created_ms INTEGER NOT NULL
);
CREATE TRIGGER econ_openings_update BEFORE UPDATE ON econ_openings BEGIN SELECT RAISE(ABORT,'immutable opening'); END;
CREATE TRIGGER econ_openings_delete BEFORE DELETE ON econ_openings BEGIN SELECT RAISE(ABORT,'immutable opening'); END;
