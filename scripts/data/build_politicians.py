#!/usr/bin/env python3
"""
Construye la base de personajes políticos REALES del escenario 2026 a partir de fuentes oficiales.

Fuentes (todas descargadas por scripts/data/download_politicians.sh):
  - Cámara de Diputadas y Diputados, datos abiertos (opendata.camara.cl):
      retornarDiputadosPeriodoActual (155 en ejercicio, fecha de nacimiento, militancias con fechas)
      retornarDiputados (histórico 1990-2030) y retornarDiputadosXPeriodo (períodos servidos)
  - SERVEL:
      PRELIMINARES_DIPUTADOS 2025 (columna electo_nominado → distrito de cada diputado/a)
      PRELIMINARES_SENADORES_CIRCUNSCRIPCION 2025 (electo_nominado)
      Senadores 2021 TRICEL (votos definitivos; electos calculados con D'Hondt por pacto)
      Resoluciones de partidos constituidos (directivas centrales inscritas)
      Resultados de la segunda votación presidencial 2025
  - Sitios oficiales de ministerios (titulares confirmados en la consulta del 2026-11-07)

Reglas: no se inventa ningún dato. Si un dato no está en una fuente, queda en null.
Los nombres de directivas se conservan tal como aparecen en la resolución de SERVEL.
"""
import glob, json, re, sys, unicodedata, collections, subprocess
import openpyxl

RAW = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/data/real'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'src/data/characters/generated.json'
CONSULTED = '2026-11-07'
SCENARIO = '2026-11-09'

def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().upper()
    s = re.sub(r'[^A-Z ]', ' ', s.replace('-', ' '))
    return ' '.join(s.split())

def title(s):
    small = {'DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y'}
    words = []
    for i, w in enumerate(s.split()):
        words.append('-'.join(p.lower() if (p in small and i > 0) else p[:1] + p[1:].lower() for p in w.split('-')))
    return ' '.join(words)

SOURCES = {}
def src(sid, title_, url, institution, kind='oficial', date=None):
    SOURCES[sid] = {'id': sid, 'title': title_, 'url': url, 'institution': institution, 'kind': kind, 'consulted': CONSULTED, 'published': date}
    return sid

S_CAM_ACT = src('camara-periodo-actual', 'Diputados del período legislativo actual (servicio de datos abiertos)', 'https://opendata.camara.cl/camaradiputados/WServices/WSDiputado.asmx/retornarDiputadosPeriodoActual', 'Cámara de Diputadas y Diputados')
S_CAM_HIST = src('camara-historico', 'Diputados históricos y por período legislativo (servicio de datos abiertos)', 'https://opendata.camara.cl/camaradiputados/WServices/WSDiputado.asmx/retornarDiputados', 'Cámara de Diputadas y Diputados')
S_SERVEL_DIP = src('servel-dip-2025', 'Resultados preliminares Diputados 2025 por mesa (columna electo)', 'https://www.servel.cl/wp-content/uploads/2025/11/PRELIMINARES_DIPUTADOS.zip', 'SERVEL', date='2025-11-20')
S_SERVEL_SEN25 = src('servel-sen-2025', 'Resultados preliminares Senadores 2025 por circunscripción (columna electo)', 'https://www.servel.cl/wp-content/uploads/2025/11/PRELIMINARES_SENADORES_CIRCUNSCRIPCION.zip', 'SERVEL', date='2025-11-21')
S_SERVEL_SEN21 = src('servel-sen-2021', 'Resultados Senadores 2021, votación TRICEL por mesa', 'https://www.servel.cl/wp-content/uploads/2022/12/Senadores-1.zip', 'SERVEL', date='2022-12-14')
S_SERVEL_P2 = src('servel-pres-2025-2v', 'Resultados segunda votación presidencial 2025', 'https://www.servel.cl/wp-content/uploads/2025/12/Datos_SegundaVotacion-1.zip', 'SERVEL', date='2025-12-14')
S_SERVEL_PARTIDOS = src('servel-partidos', 'Partidos constituidos al 30 de septiembre de 2026', 'https://www.servel.cl/partidos-politicos/partidos-constituidos/', 'SERVEL', date='2026-10')

PARTY_MAP = {'PREP': 'REP', 'DC': 'PDC', 'EVOP': 'EVO', 'PCCH': 'PCC', 'FA': 'FA', 'PDG': 'PDG', 'UDI': 'UDI', 'RN': 'RN', 'PS': 'PS', 'PNL': 'PNL', 'PC': 'PC', 'PPD': 'PPD', 'PL': 'PL', 'PR': 'PR', 'FRVS': 'FRVS', 'IND': None}
SERVEL_PARTY = {'PARTIDO REPUBLICANO DE CHILE': 'REP', 'UNION DEMOCRATA INDEPENDIENTE': 'UDI', 'RENOVACION NACIONAL': 'RN', 'EVOLUCION POLITICA': 'EVO', 'PARTIDO SOCIALISTA DE CHILE': 'PS', 'PARTIDO POR LA DEMOCRACIA': 'PPD', 'PARTIDO RADICAL DE CHILE': 'PR', 'PARTIDO DEMOCRATA CRISTIANO': 'PDC', 'PARTIDO COMUNISTA DE CHILE': 'PC', 'FRENTE AMPLIO': 'FA', 'PARTIDO DE LA GENTE': 'PDG', 'PARTIDO LIBERAL DE CHILE': 'PL', 'FEDERACION REGIONALISTA VERDE SOCIAL': 'FRVS', 'PARTIDO NACIONAL LIBERTARIO': 'PNL', 'PARTIDO SOCIAL CRISTIANO': None, 'INDEPENDIENTE': None, 'PARTIDO CRISTIANO DE CHILE': 'PCC'}
REGION_BY_CIRC = {1: 'AP', 2: 'TA', 3: 'AN', 4: 'AT', 5: 'CO', 6: 'VA', 7: 'RM', 8: 'OH', 9: 'ML', 10: 'BI', 11: 'AR', 12: 'LR', 13: 'LL', 14: 'AI', 15: 'MA', 16: 'NB'}
REGION_BY_SERVEL_NRO = {15: 'AP', 1: 'TA', 2: 'AN', 3: 'AT', 4: 'CO', 5: 'VA', 13: 'RM', 6: 'OH', 7: 'ML', 16: 'NB', 8: 'BI', 9: 'AR', 14: 'LR', 10: 'LL', 11: 'AI', 12: 'MA'}

# ---------------------------------------------------------------------------
# 1. Cámara: histórico y períodos
# ---------------------------------------------------------------------------
def parse_dips(path):
    s = open(path, encoding='utf-8').read()
    out = {}
    for blk in re.split(r'<Diputado>', s)[1:]:
        g = lambda tag: (re.search(rf'<{tag}>([^<]*)</{tag}>', blk) or [None, None])[1]
        did = g('Id')
        if not did: continue
        mil = []
        for m in re.finditer(r'<Militancia>\s*<FechaInicio>([^<]*)</FechaInicio>\s*<FechaTermino(?: xsi:nil="true" />|>([^<]*)</FechaTermino>)\s*<Partido>\s*<Id>([^<]*)</Id>\s*<Nombre>([^<]*)</Nombre>', blk):
            mil.append({'from': m.group(1)[:10], 'to': (m.group(2) or '')[:10] or None, 'partyCode': m.group(3), 'partyName': m.group(4)})
        mil.sort(key=lambda x: x['from'])
        sexo = re.search(r'<Sexo Valor="(\d)">', blk)
        out[did] = {'camId': did, 'first': (g('Nombre') or '').strip(), 'first2': (g('Nombre2') or '').strip(), 'pat': (g('ApellidoPaterno') or '').strip(), 'mat': (g('ApellidoMaterno') or '').strip(),
                    'birth': (g('FechaNacimiento') or '')[:10] or None, 'gender': ('f' if sexo and sexo.group(1) == '0' else 'm') if sexo else None, 'militancias': mil}
    return out

hist = parse_dips(f'{RAW}/dip_all.xml')
current = parse_dips(f'{RAW}/dip.xml')
for k, v in current.items(): hist.setdefault(k, v)
PERIODS = {'1': '1990-1994', '2': '1994-1998', '3': '1998-2002', '4': '2002-2006', '5': '2006-2010', '6': '2010-2014', '8': '2014-2018', '9': '2018-2022', '10': '2022-2026', '11': '2026-2030'}
served = collections.defaultdict(list)
for pid, name in PERIODS.items():
    s = open(f'{RAW}/per_{pid}.xml', encoding='utf-8').read()
    for did in set(re.findall(r'<Diputado>\s*<Id>(\d+)</Id>', s)): served[did].append(name)

def keyof(first, pat, mat):
    return norm(f'{first.split()[0] if first else ""} {pat} {mat}')

by_key = {}
for d in hist.values(): by_key.setdefault(keyof(d['first'], d['pat'], d['mat']), d)

def find_cam(full):
    """Busca una persona del registro de la Cámara cuyo primer nombre y dos apellidos aparezcan, en orden, en el nombre dado."""
    n = norm(full).split()
    hits = []
    for d in hist.values():
        f = norm(d['first']).split()[:1]; p = norm(d['pat']).split(); m = norm(d['mat']).split()
        if not f or not p: continue
        seq = f + p + m[:1]
        it = iter(n)
        if all(tok in it for tok in seq): hits.append(d)
    return hits[0] if len(hits) == 1 else None

# ---------------------------------------------------------------------------
# 2. Personas
# ---------------------------------------------------------------------------
people = {}   # id -> persona
by_namekey = {}  # 'NOMBRE APELLIDO1 APELLIDO2' -> id (evita duplicados entre fuentes)
def person_for_cam(d):
    pid = f'cl-cam-{d["camId"]}'
    if pid not in people:
        first = ' '.join(x for x in [d['first'], d['first2']] if x)
        people[pid] = {'id': pid, 'givenNames': first, 'surnames': f'{d["pat"]} {d["mat"]}'.strip(), 'fullName': f'{first} {d["pat"]} {d["mat"]}'.strip(), 'publicName': f'{d["first"]} {d["pat"]}'.strip() if d['first'] else d['pat'],
                       'gender': d['gender'], 'birthDate': d['birth'], 'birthSource': S_CAM_HIST if d['birth'] else None,
                       'memberships': [{'party': PARTY_MAP.get(m['partyCode'], None), 'realParty': m['partyName'], 'from': m['from'], 'to': m['to'], 'source': S_CAM_HIST} for m in d['militancias']],
                       'positions': [{'role': 'diputado', 'label': f'Diputado/a, período {p}', 'from': p[:4] + '-03-11', 'to': p[5:] + '-03-11', 'source': S_CAM_HIST} for p in sorted(served.get(d['camId'], []))],
                       'regionId': None, 'sources': [S_CAM_HIST]}
    return people[pid]

PARTICLES = {'VAN', 'VON', 'DE', 'DEL', 'LA', 'MAC'}
def split_name(full):
    """Separa nombres y apellidos (dos apellidos al final; partículas como VAN/DE se unen al apellido)."""
    t = full.split()
    if len(t) <= 2: return t[0], ' '.join(t[1:])
    sur = [t.pop()]                      # apellido materno
    if t and re.search(r'-(VON|VAN|DE|DEL)$', t[-1].upper()): sur.insert(0, t.pop())   # p. ej. BARENTS-VON HOHENHAGEN
    pat = [t.pop()]
    while t and t[-1].upper() in PARTICLES and len(t) > 1: pat.insert(0, t.pop())
    return ' '.join(t), ' '.join(pat + sur)

def person_for_name(full_upper, source, gender=None):
    d = find_cam(full_upper)
    if d: return person_for_cam(d)
    toks = norm(full_upper).split()
    nkey = f'{toks[0]} {" ".join(toks[-2:])}' if len(toks) >= 3 else ' '.join(toks)
    if nkey in by_namekey: return people[by_namekey[nkey]]
    pid = 'cl-' + norm(full_upper).lower().replace(' ', '-')
    by_namekey[nkey] = pid
    if pid not in people:
        given, sur = split_name(full_upper)
        people[pid] = {'id': pid, 'givenNames': title(given), 'surnames': title(sur), 'fullName': title(full_upper), 'publicName': title(given.split()[0] + ' ' + (sur.split()[0] if not sur.split()[0] in PARTICLES else ' '.join(sur.split()[:2]))), 'gender': gender, 'birthDate': None, 'birthSource': None,
                       'memberships': [], 'positions': [], 'regionId': None, 'sources': [source]}
    return people[pid]

# 2a. Diputados en ejercicio + distrito (SERVEL 2025)
cands = json.load(open(f'{RAW}/cand_dip_2025.json', encoding='utf-8'))
elected = [c for c in cands if c['electo']]
DISTRICT_REGION = {}
for m in re.finditer(r"\[(\d+), '([A-Z]+)', \d+\]", open('src/game/data/geography.ts', encoding='utf-8').read()):
    DISTRICT_REGION[int(m.group(1))] = m.group(2)
unmatched = []
seats = []
for d in current.values():
    seq = [norm(d['first']).split()[0]] + norm(d['pat']).split() + norm(d['mat']).split()
    hits = []
    for c in elected:
        it = iter(norm(c['nombre']).split())
        if all(t in it for t in seq): hits.append(c)
    if len(hits) != 1:
        # segundo intento: primer nombre + apellido paterno
        # segundo intento: ambos apellidos en orden y cualquiera de los nombres de pila (SERVEL usa a veces el segundo nombre)
        given = set(norm(d['first'] + ' ' + d['first2']).split())
        hits = []
        for c in elected:
            toks = norm(c['nombre']).split(); it = iter(toks)
            if all(t in it for t in norm(d['pat']).split() + norm(d['mat']).split()) and given & set(toks[:2]): hits.append(c)
    p = person_for_cam(d)
    p['sources'] = sorted(set(p['sources'] + [S_CAM_ACT]))
    cur = [m for m in p['memberships'] if m['from'] <= SCENARIO and (m['to'] is None or m['to'] >= SCENARIO)]
    party = cur[-1]['party'] if cur else None
    real_party = cur[-1]['realParty'] if cur else None
    if len(hits) == 1:
        dist = hits[0]['distrito']; elected.remove(hits[0])
        p['regionId'] = DISTRICT_REGION.get(dist)
        p['sources'].append(S_SERVEL_DIP)
        seats.append({'personId': p['id'], 'chamber': 'camara', 'unit': dist, 'regionId': DISTRICT_REGION.get(dist), 'party': party, 'realParty': real_party, 'from': '2026-03-11', 'to': '2030-03-11', 'sources': [S_CAM_ACT, S_SERVEL_DIP]})
    else:
        unmatched.append((p['fullName'], len(hits)))
print('diputados en ejercicio', len(current), 'sin distrito', unmatched, file=sys.stderr)
print('electos SERVEL no emparejados', [c['nombre'] for c in elected], file=sys.stderr)

# 2b. Senado 2025 (electo_nominado)
sen25 = {}
for f in glob.glob(f'{RAW}/s25/*.xlsx'):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]; hdr = None
    for r in ws.iter_rows(values_only=True):
        if hdr is None: hdr = {k: i for i, k in enumerate(r)}; continue
        if not r[hdr['electo_nominado']]: continue
        k = r[hdr['cod_candidato']]
        if k in sen25: continue
        sen25[k] = {'nombre': ' '.join(str(r[hdr['nombre_candidato']]).split()), 'partido': r[hdr['partido']], 'circ': int(str(r[hdr['circunscripcion_senatorial']]).split()[-1])}
print('senadores electos 2025', len(sen25), file=sys.stderr)

# 2c. Senado 2021: D'Hondt por pacto con votos TRICEL; se acepta solo si la asignación es robusta
def dhondt(votes, seats):
    q = sorted(((v / d, k) for k, v in votes.items() for d in range(1, seats + 1)), reverse=True)[:seats]
    out = collections.Counter(k for _, k in q)
    margin = q[-1][0] - (sorted(((v / d, k) for k, v in votes.items() for d in range(1, seats + 2)), reverse=True)[seats][0])
    return out, margin
SEN_SEATS = {}
geo = open('src/game/data/geography.ts', encoding='utf-8').read()
for m in re.finditer(r"id: '([A-Z]+)', name: (?:'[^']*'|\"[^\"]*\").*?senateSeats: (\d+)", geo): SEN_SEATS[m.group(1)] = int(m.group(2))
sen21 = []; ambiguous21 = []
for f in sorted(glob.glob(f'{RAW}/s21/**/*.xlsx', recursive=True)):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]; hdr = None
    cand = collections.Counter(); meta = {}
    region = None
    for r in ws.iter_rows(values_only=True):
        if hdr is None: hdr = {k: i for i, k in enumerate(r)}; continue
        if r[hdr['Candidato']] is None: continue
        name = ' '.join(str(r[hdr['Candidato']]).split())
        if name.upper().startswith(('VOTOS ', 'TOTAL')): continue
        region = REGION_BY_SERVEL_NRO.get(int(r[hdr['Nro. Región']]))
        lista = r[hdr['Lista']] or name
        cand[name] += r[hdr['Votos TRICEL']] or 0
        meta[name] = {'lista': lista, 'partido': r[hdr['Partido']] or 'INDEPENDIENTE'}
    if not region: continue
    n = SEN_SEATS[region]
    lists = collections.Counter(); [lists.__setitem__(meta[c]['lista'], lists[meta[c]['lista']] + v) for c, v in cand.items()]
    alloc, margin = dhondt(lists, n)
    winners = []; robust = margin > 0
    for l, k in alloc.items():
        ranked = sorted([c for c in cand if meta[c]['lista'] == l], key=lambda c: -cand[c])
        # robustez frente a subpactos no informados: el k-ésimo debe superar al siguiente con holgura (>5%)
        if len(ranked) > k and cand[ranked[k - 1]] < cand[ranked[k]] * 1.05: robust = False
        winners += ranked[:k]
    if robust: sen21 += [{'nombre': w, 'partido': meta[w]['partido'], 'region': region} for w in winners]
    else: ambiguous21.append(region)
print('senadores 2021 calculados', len(sen21), 'regiones ambiguas', ambiguous21, file=sys.stderr)

# ---------------------------------------------------------------------------
# 3. Directivas de partidos (resoluciones SERVEL)
# ---------------------------------------------------------------------------
PDF_PARTY = {'PARTIDO-DEMOCRATA-CRISTIANO': 'PDC', 'PARTIDO-POR-LA-DEMOCRACIA': 'PPD', 'PARTIDO-RADICAL-DE-CHILE': 'PR', 'PARTIDO-SOCIALISTA-DE-CHILE': 'PS', 'FEDERACION-REGIONALISTA-VERDE-SOCIAL': 'FRVS', 'PARTIDO-LIBERAL-DE-CHILE': 'PL', 'PARTIDO-DE-LA-GENTE': 'PDG', 'EVOLUCION-POLITICA': 'EVO', 'PARTIDO-COMUNISTA-DE-CHILE': 'PC', 'UNION-DEMOCRATA-INDEPENDIENTE': 'UDI', 'RENOVACION-NACIONAL': 'RN', 'FRENTE-AMPLIO': 'FA', 'PARTIDO-NACIONAL-LIBERTARIO': 'PNL', 'PARTIDO-REPUBLICANO-DE-CHILE': 'REP', 'PARTIDO-CRISTIANO-DE-CHILE': 'PCC'}
urls = {u.strip().split('/')[-1]: u.strip() for u in open(f'{RAW}/res/urls.txt')}
leadership = []
for fname, url in urls.items():
    base = re.sub(r'-\d+\.pdf$|\.pdf$', '', fname)
    party = PDF_PARTY.get(base)
    if not party: continue
    pub = re.search(r'/uploads/(\d{4})/(\d{2})/', url)
    sid = src(f'servel-directiva-{party}', f'Resolución de inscripción y directiva central: {base.replace("-", " ").title()}', url, 'SERVEL', date=f'{pub.group(1)}-{pub.group(2)}' if pub else None)
    txt = subprocess.run(['pdftotext', '-layout', f'{RAW}/res/{fname}', '-'], capture_output=True, text=True).stdout
    block = re.split(r'Cantidad de afiliados|ESCRITURA DE CONSTITUCI', txt)[0]
    mo = re.search(r'RGANO EJECUTIVO[^\n]*\n|\n\s*DIRECTIVA CENTRAL\s*\n', block)
    block = '\n' + block[mo.end():] if mo else block
    lines = [l.rstrip() for l in block.split('\n')]
    pending_role = ''
    last_role = None
    for l in lines:
        if not l.strip(): continue
        m = re.match(r'^\s*(\S.*?\S)\s{2,}(\S.*)$', l)
        if m: role, name = m.group(1).strip(), m.group(2).strip(); role = (pending_role + ' ' + role).strip(); pending_role = ''
        elif re.match(r'^\s{20,}\S', l) and last_role: role, name = last_role, l.strip()
        else: pending_role = (pending_role + ' ' + l.strip()).strip(); continue
        if leadership and leadership[-1]['party'] == party and leadership[-1]['_cont'] and not m:
            leadership[-1]['name'] += ' ' + name; leadership[-1]['_cont'] = False; continue
        last_role = role
        entry = {'party': party, 'role': role.title(), 'name': name, 'vacant': name.upper() == 'VACANTE', 'source': sid, '_cont': name.endswith(('KAISER',))}
        leadership.append(entry)
for e in leadership:
    e.pop('_cont', None)
    if e['vacant']: e['personId'] = None; continue
    p = person_for_name(e['name'], e['source'])
    e['personId'] = p['id']
    if e['source'] not in p['sources']: p['sources'].append(e['source'])
    p['positions'].append({'role': 'directiva_partido', 'label': f'{e["role"]} ({e["party"]})', 'from': None, 'to': None, 'source': e['source'], 'party': e['party'], 'asOf': SOURCES[e['source']]['published']})
    if not any(m.get('party') == e['party'] and m['to'] is None for m in p['memberships']):
        p['memberships'].append({'party': e['party'], 'realParty': e['party'], 'from': None, 'to': None, 'source': e['source'], 'note': 'Militancia inferida de su cargo en la directiva inscrita'})
print('directivas', collections.Counter(e['party'] for e in leadership), file=sys.stderr)

# Senadores → personas
for k, c in list(sen25.items()):
    p = person_for_name(c['nombre'], S_SERVEL_SEN25)
    p['sources'] = sorted(set(p['sources'] + [S_SERVEL_SEN25]))
    region = REGION_BY_CIRC[c['circ']]; p['regionId'] = p['regionId'] or region
    seats.append({'personId': p['id'], 'chamber': 'senado', 'unit': c['circ'], 'regionId': region, 'party': SERVEL_PARTY.get(norm(c['partido']), None), 'realParty': c['partido'].title(), 'from': '2026-03-11', 'to': '2034-03-11', 'sources': [S_SERVEL_SEN25], 'note': 'Electo/a en 2025 según SERVEL (resultados preliminares)'})
    p['positions'].append({'role': 'senador', 'label': f'Senador/a electo/a 2025, período 2026-2034', 'from': '2026-03-11', 'to': '2034-03-11', 'source': S_SERVEL_SEN25})
for c in sen21:
    p = person_for_name(c['nombre'], S_SERVEL_SEN21)
    p['sources'] = sorted(set(p['sources'] + [S_SERVEL_SEN21]))
    p['regionId'] = p['regionId'] or c['region']
    seats.append({'personId': p['id'], 'chamber': 'senado', 'unit': None, 'regionId': c['region'], 'party': SERVEL_PARTY.get(norm(c['partido']), None), 'realParty': c['partido'].title(), 'from': '2022-03-11', 'to': '2030-03-11', 'sources': [S_SERVEL_SEN21], 'note': 'Electo/a en 2021 (votación TRICEL; asignación D\'Hondt calculada). Permanencia en el cargo a nov-2026 no verificada contra el Senado.'})
    p['positions'].append({'role': 'senador', 'label': 'Senador/a electo/a 2021, período 2022-2030', 'from': '2022-03-11', 'to': '2030-03-11', 'source': S_SERVEL_SEN21})

# ---------------------------------------------------------------------------
# 4. Ejecutivo
# ---------------------------------------------------------------------------
kast = find_cam('JOSE ANTONIO KAST RIST')
pres = person_for_cam(kast)
pres['sources'] = sorted(set(pres['sources'] + [S_SERVEL_P2]))
pres['positions'].append({'role': 'presidente', 'label': 'Presidente de la República, período 2026-2030', 'from': '2026-03-11', 'to': '2030-03-11', 'source': S_SERVEL_P2, 'note': 'Ganó la segunda votación del 14-12-2025 (SERVEL); asume el 11 de marzo (art. 30 CPR)'})
if not any(m['party'] == 'REP' and m['to'] is None for m in pres['memberships']):
    pres['memberships'].append({'party': 'REP', 'realParty': 'Partido Republicano de Chile', 'from': None, 'to': None, 'source': S_SERVEL_P2, 'note': 'Candidatura del Partido Republicano de Chile según SERVEL'})
executive = [{'personId': pres['id'], 'role': 'presidente', 'from': '2026-03-11', 'source': S_SERVEL_P2}]
MINISTERS = [  # titular confirmado en el sitio oficial del ministerio (consulta 2026-11-07)
    ('CLAUDIO ALVARADO', 'interior', 'https://interior.gob.cl/', 'Ministerio del Interior'),
    ('FERNANDO BARROS', 'defensa', 'https://www.defensa.cl/', 'Ministerio de Defensa Nacional'),
    ('TOMÁS RAU', 'trabajo', 'https://www.mintrab.gob.cl/', 'Ministerio del Trabajo y Previsión Social'),
    ('CATALINA PAROT', 'bienes', 'https://www.bienesnacionales.cl/', 'Ministerio de Bienes Nacionales'),
    ('FRANCISCO UNDURRAGA', 'culturas', 'https://www.cultura.gob.cl/', 'Ministerio de las Culturas, las Artes y el Patrimonio'),
]
for name, ministry, url, inst in MINISTERS:
    sid = src(f'sitio-{ministry}', f'Sitio oficial: {inst}', url, inst)
    d = find_cam(name)
    p = person_for_cam(d) if d else person_for_name(name, sid)
    p['sources'] = sorted(set(p['sources'] + [sid]))
    p['positions'].append({'role': 'ministro', 'label': f'Titular de {inst}', 'from': None, 'to': None, 'source': sid, 'asOf': CONSULTED})
    executive.append({'personId': p['id'], 'role': 'ministro', 'ministry': ministry, 'from': None, 'source': sid})

# Un parlamentario que asumió como ministro cesa en su escaño (art. 58 CPR): el escaño queda sin titular verificado
minister_ids = {e['personId'] for e in executive if e['role'] == 'ministro'}
seats = [x for x in seats if x['personId'] not in minister_ids and x['personId'] != pres['id']]
# Sin duplicados de escaño por persona (p. ej., senador 2021 electo diputado 2025)
cnt = collections.Counter(x['personId'] for x in seats)
dups = [k for k, v in cnt.items() if v > 1]
seats = [x for x in seats if x['personId'] not in dups or x['chamber'] == 'camara']

pub = collections.Counter(p['publicName'] for p in people.values())
for p in people.values():
    if pub[p['publicName']] > 1: p['publicName'] = f"{p['givenNames']} {p['surnames']}"   # homónimos: nombre completo
    p['updated'] = CONSULTED
    p['sources'] = sorted(set(p['sources']))
    p['memberships'].sort(key=lambda m: m['from'] or '9999')

data = {'scenarioDate': SCENARIO, 'consulted': CONSULTED, 'people': sorted(people.values(), key=lambda p: p['id']), 'seats': seats, 'leadership': leadership, 'executive': executive,
        'sources': sorted(SOURCES.values(), key=lambda x: x['id']),
        'coverage': {'deputies': sum(1 for x in seats if x['chamber'] == 'camara'), 'senators': sum(1 for x in seats if x['chamber'] == 'senado'), 'senateAmbiguousRegions2021': ambiguous21,
                     'unmatchedDeputies': [u[0] for u in unmatched], 'droppedDuplicateSeats': dups}}
json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('personas', len(people), 'escaños', len(seats), file=sys.stderr)
