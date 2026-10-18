// Offline/staging library. No production route and no balance writes.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
}
const object = x => !!x && typeof x === 'object' && !Array.isArray(x);
const amount = x => Number.isSafeInteger(x) && x >= 0;
const fields = ['coins','cards','rw','paid','shop','skins','sbc','cupGot','xd'];

// uid and source labels must come from the operator's export manifest, not a client request.
// Even a D1 save is client-originated evidence, never a verified wallet.
export async function preview({ uid, snapshots, purchases = [], receipts = [], catalog }) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !(catalog instanceof Set)) throw Error('invalid operator input');
  if (!Array.isArray(snapshots) || snapshots.length > 20 || !Array.isArray(purchases) || !Array.isArray(receipts)) throw Error('invalid evidence');
  const sources = [], issues = new Set();
  for (const snapshot of snapshots) {
    if (!['d1_save','telegram_cloud','local_only'].includes(snapshot.source) || typeof snapshot.raw !== 'string' || new TextEncoder().encode(snapshot.raw).length > 900000) throw Error('invalid snapshot');
    const hash = await digest(snapshot.raw);
    let d;
    try { d = JSON.parse(snapshot.raw); } catch (_) { issues.add('malformed_snapshot'); sources.push({ source:snapshot.source, hash, valid:false }); continue; }
    if (!object(d)) { issues.add('malformed_snapshot'); sources.push({ source:snapshot.source, hash, valid:false }); continue; }
    const errors = [];
    if (!amount(d.coins)) errors.push('invalid_coins');
    if (d.rw !== undefined && (!object(d.rw) || !amount(d.rw.trophies) || d.rw.trophies > 11000)) errors.push('invalid_trophies');
    if (d.cards !== undefined) {
      if (!object(d.cards) || !object(d.cards.own) || (d.cards.used !== undefined && !object(d.cards.used))) errors.push('invalid_inventory');
      else {
        const used = d.cards.used || {};
        for (const key of new Set([...Object.keys(d.cards.own), ...Object.keys(used)])) {
          const own = Object.hasOwn(d.cards.own,key) ? d.cards.own[key] : 0, spent = Object.hasOwn(used,key) ? used[key] : 0;
          if (!catalog.has(key)) errors.push('unknown_card');
          if (!amount(own) || !amount(spent) || spent > own) errors.push('invalid_inventory');
        }
      }
    }
    for (const field of ['shop','skins','sbc','xd']) if (d[field] !== undefined && !object(d[field])) errors.push('invalid_'+field);
    for (const field of ['paid','cupGot']) if (d[field] !== undefined && !Array.isArray(d[field])) errors.push('invalid_'+field);
    errors.forEach(x => issues.add(x));
    const projection = Object.fromEntries(fields.filter(k => Object.hasOwn(d,k)).map(k => [k,d[k]]));
    sources.push({ source:snapshot.source, hash, economyHash:await digest(canonical(projection)), valid:!errors.length });
  }
  if (!sources.length) issues.add('missing_snapshot');
  if (new Set(sources.filter(x=>x.valid).map(x=>x.economyHash)).size > 1) issues.add('device_disagreement');
  // Read-only reconciliation; receipts do not prove whether a legacy client already received a reward.
  // Preserve unmatched purchases (old purchases predate receipt recording).
  const paymentEvidence = [], seenCharges = new Map();
  const validPurchase = p => p.id === uid && typeof p.item === 'string' && amount(p.season) && amount(p.stars) && p.stars > 0;
  const keys = new Set();
  for (const p of purchases) {
    if (!validPurchase(p)) { issues.add('invalid_purchase_evidence'); continue; }
    const key = canonical([p.item,p.season]);
    if (keys.has(key)) issues.add('duplicate_purchase_evidence');
    keys.add(key);
    const matching = receipts.filter(r => r.id === uid && r.item === p.item && r.purchase === p.season && r.stars === p.stars && typeof r.charge === 'string' && r.charge.length > 0);
    paymentEvidence.push({ item:p.item, purchase:p.season, matched:matching.length === 1 });
    if (matching.length !== 1) issues.add(matching.length ? 'multiple_receipts' : 'legacy_purchase_without_receipt');
  }
  for (const r of receipts) {
    if (r.id !== uid || typeof r.charge !== 'string' || !r.charge || !amount(r.stars) || !r.stars || !amount(r.purchase)) { issues.add('invalid_receipt_evidence'); continue; }
    if (seenCharges.has(r.charge)) issues.add('duplicate_charge');
    seenCharges.set(r.charge,true);
    if (!purchases.some(p=>validPurchase(p) && p.item===r.item && p.season===r.purchase && p.stars===r.stars)) issues.add('receipt_without_purchase');
  }
  return { version:1, uid, status:issues.size ? 'review' : 'pending', authority:'legacy', sources,
    issues:[...issues].sort(), paymentEvidence, canActivate:false, canGrant:false };
}

export async function savePreview(db, reviewId, input) {
  if (!/^[a-zA-Z0-9:_-]{8,96}$/.test(reviewId)) throw Error('invalid review id');
  const result = await preview(input);
  const hash = await digest(canonical({ uid:input.uid, snapshots:input.snapshots, purchases:input.purchases || [], receipts:input.receipts || [], catalog:[...input.catalog].sort() }));
  const previous = () => db.prepare('SELECT request_hash, result_json FROM shadow_reviews WHERE uid = ? AND review_id = ?').bind(input.uid,reviewId).first();
  const replay = row => {
    if (row.request_hash !== hash) throw Error('review id conflict');
    return JSON.parse(row.result_json);
  };
  const old = await previous(); if (old) return replay(old);
  const now = Date.now();
  // Retain even malformed source bytes: a failed validation must not erase evidence.
  const evidence = [];
  for (let i=0;i<input.snapshots.length;i++) {
    const snapshot = input.snapshots[i];
    evidence.push(db.prepare('INSERT OR IGNORE INTO shadow_snapshots (uid, source, digest, raw_json, received_ms) VALUES (?, ?, ?, ?, ?)').bind(input.uid,snapshot.source,result.sources[i].hash,snapshot.raw,now));
  }
  try {
    await db.batch([
      db.prepare('INSERT INTO shadow_reviews (uid, review_id, request_hash, result_json, created_ms) VALUES (?, ?, ?, ?, ?)').bind(input.uid,reviewId,hash,JSON.stringify(result),now),
      ...evidence,
    ]);
  } catch (error) {
    const committed = await previous(); if (committed) return replay(committed);
    throw error;
  }
  return result;
}
