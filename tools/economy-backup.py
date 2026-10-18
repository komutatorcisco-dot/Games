"""Validate a D1 SQL export and restore into a NEW local SQLite file only.
No credentials, network, production database access, or player data in stdout.
"""
import argparse
import hashlib
import json
import os
import sqlite3
from pathlib import Path


def fingerprint(db):
    result = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        quoted = '"' + name.replace('"', '""') + '"'
        hashes = []
        for row in db.execute('SELECT * FROM ' + quoted):
            encoded = json.dumps([{'blob': x.hex()} if isinstance(x, bytes) else x for x in row], ensure_ascii=True, separators=(',', ':'))
            hashes.append(hashlib.sha256(encoded.encode()).hexdigest())
        result[name] = {'rows': len(hashes), 'sha256': hashlib.sha256(''.join(sorted(hashes)).encode()).hexdigest()}
    schema = list(db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"))
    return {'tables': result, 'schema_sha256': hashlib.sha256(json.dumps(schema).encode()).hexdigest()}


def restore(export, target):
    export, target = Path(export), Path(target)
    raw = export.read_bytes()
    db = sqlite3.connect(':memory:')
    # A SQL export must not attach files, load code, or redirect SQLite directories.
    def authorize(action, first, second, *_):
        if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION and second == 'load_extension':
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_PRAGMA and first not in ('foreign_keys', 'defer_foreign_keys'):
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK
    db.set_authorizer(authorize)
    try:
        db.executescript(raw.decode('utf-8-sig'))
        db.commit()
        db.set_authorizer(None)
        if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('database integrity check failed')
        before = fingerprint(db)
        if not before['tables']:
            raise ValueError('empty export')
        # Refuse to overwrite an existing database (including the source).
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        dest = sqlite3.connect(target)
        try:
            db.backup(dest)
            after = fingerprint(dest)
            if before != after or dest.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                raise ValueError('restore mismatch')
        finally:
            dest.close()
        return {'version': 1, 'export_sha256': hashlib.sha256(raw).hexdigest(), 'restored': True, **after}
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--export', required=True)
    parser.add_argument('--new-local-db', required=True)
    args = parser.parse_args()
    print(json.dumps(restore(args.export, args.new_local_db), indent=2))
