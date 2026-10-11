-- Stage 1 only. Not imported by worker.js, not a production migration.
-- Prefix is intentionally separate from both legacy tables and PR #3 proposals.
CREATE TABLE shadow_snapshots (
  uid INTEGER NOT NULL CHECK(typeof(uid) = 'integer' AND uid > 0),
  source TEXT NOT NULL CHECK(source IN ('d1_save','telegram_cloud','local_only')),
  digest TEXT NOT NULL CHECK(length(digest) = 64),
  raw_json TEXT NOT NULL,
  received_ms INTEGER NOT NULL CHECK(typeof(received_ms) = 'integer' AND received_ms > 0),
  PRIMARY KEY(uid, source, digest)
);
CREATE TABLE shadow_reviews (
  uid INTEGER NOT NULL CHECK(typeof(uid) = 'integer' AND uid > 0),
  review_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_ms INTEGER NOT NULL CHECK(typeof(created_ms) = 'integer' AND created_ms > 0),
  PRIMARY KEY(uid, review_id)
);
-- Source evidence is append-only. Corrections require a new snapshot/review.
CREATE TRIGGER shadow_snapshots_no_update BEFORE UPDATE ON shadow_snapshots BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
CREATE TRIGGER shadow_snapshots_no_delete BEFORE DELETE ON shadow_snapshots BEGIN SELECT RAISE(ABORT, 'immutable snapshot'); END;
CREATE TRIGGER shadow_reviews_no_update BEFORE UPDATE ON shadow_reviews BEGIN SELECT RAISE(ABORT, 'immutable review'); END;
CREATE TRIGGER shadow_reviews_no_delete BEFORE DELETE ON shadow_reviews BEGIN SELECT RAISE(ABORT, 'immutable review'); END;
