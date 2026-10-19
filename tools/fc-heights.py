# Рост карточек (js/data/fcstats.js, 10-е значение) из базы Transfermarkt (релиз data-1, archive.zip → players.csv).
# Запуск: python3 tools/fc-heights.py ours.json players.csv heights.json, где ours.json — [[имя, латиницей, год рождения, позиция], …] из js/players.js.
# Сопоставление: тот же год рождения (±1) и совпадение слов имени; фамилия должна совпасть целиком.
import csv, json, sys, unicodedata, re
ours = json.load(open(sys.argv[1])); tm = list(csv.DictReader(open(sys.argv[2], encoding='utf-8')))
norm = lambda s: re.sub(r'[^a-z ]', ' ', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()).split()
by = {}
for r in tm:
    if not r['height_in_cm'] or not r['date_of_birth']: continue
    by.setdefault(int(r['date_of_birth'][:4]), []).append((set(norm(r['name'])), norm(r['last_name'] or r['name']), int(float(r['height_in_cm'])), int(r['last_season'] or 0)))
res, miss = {}, 0
for name, alt, born, pos in ours:
    a = set(norm(alt)); best = None; bs = 0
    for y in (born, born - 1, born + 1):
        for toks, last, h, ls in by.get(y, []):
            common = len(toks & a)
            if not common: continue
            lastok = all(t in a for t in last)
            s = common * 2 + (3 if lastok else 0) + (1 if y == born else 0) + (0.5 if ls >= 2025 else 0)
            if toks <= a: s += 2
            if s > bs: bs, best = s, h
    if best and bs >= 5 and 150 <= best <= 210: res[name] = best
    else: miss += 1
print(len(res), 'нашли, нет:', miss, file=sys.stderr)
json.dump(res, open(sys.argv[3], 'w'), ensure_ascii=False)
