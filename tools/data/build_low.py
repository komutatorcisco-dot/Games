#!/usr/bin/env python3
"""Бронза и серебро 65–69 из полной базы EA FC 27 (релиз data-1, archive.1.zip → players.csv) → js/data/cards-low.js.

Запуск: python3 -I tools/data/build_low.py <players.csv> <players.json> <maps.json>
  players.json — PLAYERS из js/players.js (имя, латиница, нация, флаг, лига, клуб);
  maps.json    — сопоставления EN → RU (нация, лига, клуб), собранные по уже существующим игрокам.
Берём только мужчин с рейтингом ниже 70, у которых клуб уже есть в игре с русским названием.
Имена — транслитерация с учётом страны. Лица — по номеру EA через воркер (/face/<id>), как у остальных.
"""
import csv, json, re, sys, unicodedata

csv_path, pl_path, maps_path = sys.argv[1:4]
M = json.load(open(maps_path, encoding='utf-8'))
# лига клуба — та же, что у уже существующих игроков этого клуба (а не по названию лиги в базе EA)
import collections
_cl = collections.defaultdict(collections.Counter)
for p in json.load(open(pl_path, encoding='utf-8')): _cl[p['club']][p['lg']] += 1
CLUB_LG = {c: v.most_common(1)[0][0] for c, v in _cl.items()}

POS = {'GK': 'ВРТ', 'CB': 'ЦЗ', 'LB': 'ЛЗ', 'RB': 'ПЗ', 'LWB': 'ЛЗ', 'RWB': 'ПЗ', 'CDM': 'ЦОП', 'CM': 'ЦП', 'CAM': 'ЦАП',
       'LM': 'ЛП', 'RM': 'ПП', 'LW': 'ЛВ', 'RW': 'ПВ', 'ST': 'ФРВ', 'CF': 'ФРВ'}

# ---- транслитерация латиницы на русский ----
SPA = {'Spain', 'Argentina', 'Mexico', 'Colombia', 'Uruguay', 'Chile', 'Peru', 'Ecuador', 'Venezuela', 'Paraguay', 'Bolivia', 'Costa Rica', 'Honduras', 'Panama'}
POR = {'Portugal', 'Brazil', 'Angola', 'Cape Verde', 'Mozambique', 'Guinea-Bissau'}
GER = {'Germany', 'Austria', 'Switzerland', 'Netherlands', 'Denmark', 'Norway', 'Sweden', 'Iceland', 'Belgium'}
FRA = {'France', "Côte d'Ivoire", 'Senegal', 'Cameroon', 'Mali', 'Guinea', 'Morocco', 'Algeria', 'Tunisia', 'Congo DR', 'Congo', 'Gabon', 'Burkina Faso', 'Benin', 'Togo'}
ITA = {'Italy'}
SLAV = {'Poland', 'Czechia', 'Czech Republic', 'Slovakia', 'Croatia', 'Serbia', 'Slovenia', 'Bosnia and Herzegovina', 'Montenegro', 'North Macedonia', 'Bulgaria', 'Ukraine', 'Russia'}

COMMON = [('shch', 'щ'), ('sch', 'ш'), ('tch', 'ч'), ('ch', 'ч'), ('sh', 'ш'), ('zh', 'ж'), ('kh', 'х'), ('ts', 'ц'), ('ph', 'ф'), ('th', 'т'),
          ('ck', 'к'), ('qu', 'кв'), ('oo', 'у'), ('ee', 'и'), ('ou', 'у'), ('ya', 'я'), ('yu', 'ю'), ('yo', 'йо'), ('ye', 'е')]
SINGLE = {'a': 'а', 'b': 'б', 'c': 'к', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г', 'h': 'х', 'i': 'и', 'j': 'дж', 'k': 'к', 'l': 'л', 'm': 'м',
          'n': 'н', 'o': 'о', 'p': 'п', 'q': 'к', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'v': 'в', 'w': 'у', 'x': 'кс', 'y': 'и', 'z': 'з'}

def rules(nat):
    if nat in SPA: return [('ll', 'й'), ('ñ', 'нь'), ('gue', 'ге'), ('gui', 'ги'), ('que', 'ке'), ('qui', 'ки'), ('ce', 'се'), ('ci', 'си'), ('j', 'х'), ('ge', 'хе'), ('gi', 'хи'), ('z', 'с'), ('h', ''), ('y', 'й')]
    if nat in POR: return [('nh', 'нь'), ('lh', 'ль'), ('ão', 'ан'), ('ç', 'с'), ('ce', 'се'), ('ci', 'си'), ('j', 'ж'), ('ge', 'же'), ('gi', 'жи'), ('x', 'ш'), ('h', ''), ('y', 'и')]
    if nat in GER: return [('tsch', 'ч'), ('sch', 'ш'), ('ei', 'ай'), ('eu', 'ой'), ('ie', 'и'), ('ä', 'е'), ('ö', 'ё'), ('ü', 'ю'), ('ß', 'сс'), ('w', 'в'), ('z', 'ц'), ('j', 'й'), ('v', 'ф'), ('ij', 'ей'), ('oe', 'у'), ('aa', 'о'), ('ø', 'ё'), ('å', 'о'), ('æ', 'е')]
    if nat in FRA: return [('eau', 'о'), ('aux', 'о'), ('ou', 'у'), ('oi', 'уа'), ('ai', 'е'), ('au', 'о'), ('ch', 'ш'), ('gn', 'нь'), ('qu', 'к'), ('ce', 'се'), ('ci', 'си'), ('j', 'ж'), ('ge', 'же'), ('gi', 'жи'), ('é', 'е'), ('è', 'е'), ('ç', 'с'), ('h', '')]
    if nat in ITA: return [('gli', 'льи'), ('gn', 'нь'), ('sci', 'ши'), ('sce', 'ше'), ('cci', 'ччи'), ('cce', 'чче'), ('ci', 'чи'), ('ce', 'че'), ('chi', 'ки'), ('che', 'ке'), ('ghi', 'ги'), ('ghe', 'ге'), ('gi', 'джи'), ('ge', 'дже'), ('z', 'ц'), ('h', '')]
    if nat in SLAV: return [('szcz', 'щ'), ('sz', 'ш'), ('cz', 'ч'), ('rz', 'ж'), ('ł', 'л'), ('ń', 'нь'), ('ś', 'с'), ('ć', 'ч'), ('č', 'ч'), ('š', 'ш'), ('ž', 'ж'), ('đ', 'дж'), ('dž', 'дж'), ('lj', 'ль'), ('nj', 'нь'), ('j', 'й'), ('w', 'в'), ('c', 'ц'), ('ě', 'е'), ('ř', 'рж'), ('ý', 'ы')]
    return [('j', 'дж'), ('y', 'и'), ('w', 'у')]

def translit(s, nat):
    s = s.strip()
    out = []
    for word in re.split(r'(\s+|-)', s):
        if not word or word.isspace() or word == '-': out.append(word); continue
        w = word.lower()
        for a, b in rules(nat) + COMMON:
            w = w.replace(a, b)
        w = ''.join(c for c in unicodedata.normalize('NFKD', w) if not unicodedata.combining(c))
        w = ''.join(SINGLE.get(c, c) for c in w)
        w = re.sub(r'([аеиоуыэюя])и$', r'\1й', w)   # окончание -ai, -ei → -ай, -ей
        w = re.sub(r'^е', 'э', w); w = re.sub(r'([аоуи])е', r'\1э', w)   # «Э» в начале слова и после гласной
        out.append(w[:1].upper() + w[1:])
    return ''.join(out).replace("'", '')

rows = []
for r in csv.DictReader(open(csv_path, encoding='utf-8')):
    if r['gender'] != "Men's Football": continue
    ov = int(r['overall_rating'])
    if ov >= 70: continue
    club = M['club'].get(r['club']); lg = CLUB_LG.get(club) or M['lg'].get(r['league']); nat = M['nat'].get(r['nationality'])
    if not club or not lg or not nat: continue
    pos = POS.get(r['position']); if_gk = r['position'] == 'GK'
    if not pos: continue
    name = r['common_name'] or (r['first_name'].split(' ')[0] + ' ' + r['last_name'])
    ru = translit(name, r['nationality'])
    if if_gk:
        st = [r['goalkeeping_diving'], r['goalkeeping_handling'], r['goalkeeping_kicking'], r['goalkeeping_reflexes'], r['pace'], r['goalkeeping_positioning']]
    else:
        st = [r['pace'], r['shooting'], r['passing'], r['dribbling'], r['defending'], r['physicality']]
    st = [int(x or ov) for x in st]
    rows.append([int(r['player_id']), ru, ov, pos, club, lg, nat[0], nat[1], int((r['birthdate'] or '0')[:4] or 0), st])

rows.sort(key=lambda x: -x[2])
with open('js/data/cards-low.js', 'w', encoding='utf-8') as f:
    f.write('// Бронза (до 64) и серебро 65–69 из полной базы EA FC 27 (снимок 12.09.2026, релиз data-1/archive.1.zip).\n')
    f.write('// Сборка: tools/data/build_low.py. Строка: [номер EA, имя, рейтинг, позиция, клуб, лига, нация, флаг, год рождения, 6 характеристик].\n')
    f.write("'use strict';\nconst CARDS_LOW = ")
    f.write(json.dumps(rows, ensure_ascii=False, separators=(',', ':')).replace('],[', '],\n['))
    f.write(';\n')
print(len(rows), 'bronze', sum(1 for x in rows if x[2] < 65), 'silver', sum(1 for x in rows if x[2] >= 65))
