"""
Paso 3: construye los datos territoriales del juego a partir de los pasos 1 y 2.

Uso: python3 scripts/data/build_territory.py <agg.json> <demo.json> <geo_simpl.json> <dir_salida>
Salida (en src/game/data/territory/):
  comunas.json   346 comunas: territorio electoral, demografía, resúmenes históricos por bloque y
                 votación de diputados por partido (ids del juego). Se incluye en el motor.
  history.json   resultados históricos por comuna y opción (carga diferida en la interfaz).
  geometry.json  polígonos simplificados (carga diferida).

Clasificación en bloques (izq/centro/der/pop/otro): CRITERIO DEL AUTOR, documentado en
TERRITORY.md. No se infiere ideología individual a partir del voto.
"""
import sys, json, re, unicodedata, datetime

AGG, DEMO, GEO, OUTDIR = sys.argv[1:5]

def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '').strip().upper())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("'", '').replace('-', ' ').replace('.', '')
    return re.sub(r'\s+', ' ', s)

REGION_BY_CODE = {1: 'TA', 2: 'AN', 3: 'AT', 4: 'CO', 5: 'VA', 6: 'OH', 7: 'ML', 8: 'BI', 9: 'AR', 10: 'LL', 11: 'AI', 12: 'MA', 13: 'RM', 14: 'LR', 15: 'AP', 16: 'NB'}
REGION_ORDER = ['AP', 'TA', 'AN', 'AT', 'CO', 'VA', 'RM', 'OH', 'ML', 'NB', 'BI', 'AR', 'LR', 'LL', 'AI', 'MA']
ALIAS = {'LLAILLAY': 'LLAY LLAY', 'PAIGUANO': 'PAIHUANO', 'AISEN': 'AYSEN', 'TREHUACO': 'TREGUACO', 'MARCHIHUE': 'MARCHIGUE', 'CALERA': 'LA CALERA', 'COIHAIQUE': 'COYHAIQUE', 'TILTIL': 'TIL TIL', 'CABO DE HORNOS(EX NAVARINO)': 'CABO DE HORNOS', 'ANTARTICA CHILENA': 'ANTARTICA'}
def key(n): n = norm(n); return ALIAS.get(n, n)

# --- Partidos SERVEL -> id del juego (o None = otro) ---
PARTY_RULES = [
    (r'NACIONAL LIBERTARIO', 'PNL'), (r'REPUBLICANO', 'REP'), (r'UNION DEMOCRATA INDEPENDIENTE', 'UDI'), (r'RENOVACION NACIONAL', 'RN'),
    (r'EVOLUCION POLITICA', 'EVO'), (r'PARTIDO CRISTIANO DE CHILE', 'PCC'), (r'DEMOCRATA CRISTIANO', 'PDC'), (r'POR LA DEMOCRACIA', 'PPD'),
    (r'RADICAL', 'PR'), (r'SOCIALISTA DE CHILE', 'PS'), (r'REGIONALISTA VERDE SOCIAL', 'FRVS'), (r'PARTIDO LIBERAL', 'PL'),
    (r'PARTIDO DE LA GENTE', 'PDG'), (r'COMUNISTA', 'PC'), (r'^FRENTE AMPLIO$|PARTIDO FRENTE AMPLIO', 'FA'),
    (r'REVOLUCION DEMOCRATICA', 'FA'), (r'CONVERGENCIA SOCIAL', 'FA'), (r'^COMUNES$|PARTIDO COMUNES', 'FA'),
]
BLOC_PARTY = {'PNL': 'der', 'REP': 'der', 'UDI': 'der', 'RN': 'der', 'EVO': 'der', 'PCC': 'der', 'PDC': 'centro', 'PPD': 'izq', 'PR': 'izq', 'PS': 'izq', 'FRVS': 'izq', 'PL': 'izq', 'PDG': 'pop', 'PC': 'izq', 'FA': 'izq'}
OTHER_BLOC = [(r'HUMANISTA|ECOLOGISTA|IGUALDAD|TRABAJADORES REVOLUCIONARIOS|PROGRESISTA|ALIANZA VERDE|UNION PATRIOTICA|ACCION HUMANISTA', 'izq'),
              (r'SOCIAL CRISTIANO|CONSERVADOR|REGIONALISTA INDEPENDIENTE|NUEVO TIEMPO|NACIONAL CIUDADANO', 'der'), (r'CIUDADANOS', 'centro'),
              (r'DEMOCRATAS|AMARILLOS|CENTRO UNIDO', 'centro'), (r'POPULAR', 'pop')]
def party_id(raw):
    n = norm(raw).replace('INDEPENDIENTE ', '', 1) if norm(raw).startswith('INDEPENDIENTE ') else norm(raw)
    for pat, pid in PARTY_RULES:
        if re.search(pat, n): return pid
    return None
PACT_BLOC = [(r'APRUEBO|DIGNIDAD|UNIDAD POR CHILE|VERDES|HUMANISTA|IZQUIERDA|NUEVO PACTO SOCIAL|CHILE DIGNO|ECOLOGISTA|POPULAR Y', 'izq'),
             (r'PODEMOS|SOCIAL CRISTIANO|CAMBIO POR CHILE|CHILE GRANDE|VAMOS|REPUBLICANO|LIBERTARIO', 'der'), (r'GENTE', 'pop'), (r'AMARILLOS|DEMOCRATAS|CENTRO|CIUDADANOS', 'centro')]
def pact_bloc(pact):
    n = norm(pact)
    for pat, b in PACT_BLOC:
        if re.search(pat, n): return b
    return 'otro'
def is_total(label):
    n = norm(label)
    return n.startswith('TOTAL') or 'DIFERENCIA EN TOTAL' in n or n == ''
def party_bloc(raw, pact=''):
    if norm(raw) in ('', 'INDEPENDIENTE', 'INDEPENDIENTES', 'CANDIDATURA INDEPENDIENTE'): return pact_bloc(pact)
    pid = party_id(raw)
    if pid: return BLOC_PARTY[pid]
    n = norm(raw)
    for pat, b in OTHER_BLOC:
        if re.search(pat, n): return b
    return 'otro'

# Candidaturas presidenciales -> bloque (criterio del autor; ver TERRITORY.md)
CAND_BLOC = [
    (r'BORIC|PROVOSTE|ENRIQUEZ OMINAMI|ARTES|JARA', 'izq'), (r'KAST|SICHEL|KAISER|MATTHEI', 'der'), (r'PARISI', 'pop'), (r'MAYNE NICHOLLS', 'centro'),
]
def cand_bloc(label):
    n = norm(label)
    for pat, b in CAND_BLOC:
        if re.search(pat, n): return b
    return 'otro'
# Provoste (Nuevo Pacto Social) se clasifica como centroizquierda -> 'izq' para el eje binario.

aggs = json.load(open(AGG))
demo = json.load(open(DEMO))
geo = json.load(open(GEO))
byname = {}
for c in demo:
    c['region'] = REGION_BY_CODE[c['regionCode']]
    byname.setdefault(key(c['name']), []).append(c)

def match(name, region_label):
    cands = byname.get(key(name), [])
    if len(cands) == 1: return cands[0]
    rl = norm(region_label)
    for c in cands:
        if norm(c['name']) and any(w in rl for w in norm(c['province']).split()): return c
    return cands[0] if cands else None

unmatched = set()
comunas = {c['cut']: c for c in demo}
for c in comunas.values(): c['hist'] = {}; c['parties'] = {}; c['mayor2021'] = None

history = []
for e in aggs:
    opts = {k: o for k, o in e['options'].items() if not is_total(o['label']) and not is_total(o.get('party') or 'x')}
    dropped = [k for k in e['options'] if k not in opts]
    for cd in e['comunas'].values():
        for k in dropped: cd['votes'].pop(k, None)
    okeys = sorted(opts.keys())
    is_pres = e['type'].startswith('presidencial'); is_pleb = e['type'] == 'plebiscito'
    opt_meta = []
    for k in okeys:
        o = opts[k]
        if is_pres: b = cand_bloc(o['label']); pid = party_id(o['party']) if o.get('party') else None
        elif is_pleb: b = 'izq' if 'APRUEBO' in norm(o['label']) else 'der'; pid = None
        else: b = party_bloc(o['party'], o.get('pact', '')); pid = party_id(o['party'])
        opt_meta.append({'k': k, 'label': o['label'], 'partyRaw': o.get('party', ''), 'pact': o.get('pact', ''), 'party': pid, 'bloc': b})
    # en diputados/alcaldes el historial se agrega por partido (no por candidato) para el mapa
    group = not is_pres and not is_pleb
    if group:
        gkeys = sorted({(m['party'] or ('OTRO:' + norm(m['partyRaw'] or 'INDEPENDIENTE'))) for m in opt_meta})
        gmeta = []
        for g in gkeys:
            ms = [m for m in opt_meta if (m['party'] or ('OTRO:' + norm(m['partyRaw'] or 'INDEPENDIENTE'))) == g]
            gmeta.append({'k': g, 'label': g if not g.startswith('OTRO:') else g[5:].title(), 'party': ms[0]['party'], 'bloc': ms[0]['bloc']})
    rows = {}
    for cname, cd in e['comunas'].items():
        if is_total(cname): continue
        c = match(cname, cd['region'])
        if not c: unmatched.add(cname); continue
        if cd.get('distrito'): c['district'] = cd['distrito']
        valid = sum(cd['votes'].values()); voters = valid + cd['nulos'] + cd['blancos']
        el = max(cd['electores'], voters)
        blocs = {}
        for m in opt_meta: blocs[m['bloc']] = blocs.get(m['bloc'], 0) + cd['votes'].get(m['k'], 0)
        c['hist'][e['id']] = {'t': round(voters / el, 4) if el else 0, 'bl': {b: round(v / valid, 4) for b, v in blocs.items() if valid}, 'nb': round((cd['nulos'] + cd['blancos']) / voters, 4) if voters else 0}
        if group:
            pv = {}
            for m in opt_meta:
                g = m['party'] or ('OTRO:' + norm(m['partyRaw'] or 'INDEPENDIENTE'))
                pv[g] = pv.get(g, 0) + cd['votes'].get(m['k'], 0)
            if e['type'] == 'diputados' and valid:
                c['parties'][e['id']] = {p: round(v / valid, 4) for p, v in pv.items() if not p.startswith('OTRO:') and v > 0}
            if e['type'] == 'alcaldes' and pv:
                win = max(cd['votes'].items(), key=lambda kv: kv[1])[0]
                m = next(x for x in opt_meta if x['k'] == win)
                c['mayor2021'] = m['party'] or ('IND' if 'INDEPEND' in norm(m['partyRaw']) else 'OTRO')
            rows[c['cut']] = [el, voters, cd['nulos'] + cd['blancos']] + [pv.get(g['k'], 0) for g in gmeta]
        else:
            rows[c['cut']] = [el, voters, cd['nulos'] + cd['blancos']] + [cd['votes'].get(m['k'], 0) for m in opt_meta]
    # escaños de diputados electos por distrito y partido (dato oficial preliminar 2025 / TRICEL 2021)
    seats = {}
    if e['type'] == 'diputados':
        electos = set()
        for cd in e['comunas'].values(): electos |= set(cd.get('electos', {}).keys())
        for k in electos:
            m = next(x for x in opt_meta if x['k'] == k)
            d = next((cd['distrito'] for cd in e['comunas'].values() if k in cd['votes'] and cd['votes'][k] > 0), None)
            if d is None: continue
            p = m['party'] or 'IND'
            seats.setdefault(str(d), {}); seats[str(d)][p] = seats[str(d)].get(p, 0) + 1
    history.append({'id': e['id'], 'type': e['type'], 'date': e['date'], 'status': e['status'], 'source': e['source'], 'split': e['split'],
                    'options': gmeta if group else [{'k': m['k'], 'label': m['label'], 'party': m['party'], 'bloc': m['bloc']} for m in opt_meta],
                    'c': {str(k): v for k, v in rows.items()}, 'seats': seats})
print('comunas SERVEL sin correspondencia:', sorted(unmatched))
missing_district = [c['name'] for c in comunas.values() if 'district' not in c]
print('sin distrito:', missing_district)
unknown_parties = sorted({m['partyRaw'] for e in history for m in (e['options']) if False})

out = []
for c in sorted(comunas.values(), key=lambda x: x['cut']):
    out.append({
        'cut': c['cut'], 'name': c['name'], 'region': c['region'], 'province': c['province'], 'district': c.get('district', 0),
        'circ': REGION_ORDER.index(c['region']) + 1, 'electors': c['electors2023'], 'pop': c['pop2024'], 'age': c['ageElectors'],
        'eduSup': c.get('eduSuperior', 0), 'eduLow': c.get('eduBasicaOMenos', 0), 'school': c.get('schooling18', 0), 'imm': c.get('immigrantShare', 0),
        'indig': c.get('indigenousShare', 0), 'cath': c.get('catholicShare', 0), 'evang': c.get('evangelicalShare', 0), 'norel': c.get('noReligionShare', 0),
        'wood': c.get('firewoodHeating', 0), 'inet': c.get('fixedInternet', 0), 'density': c.get('density'), 'area': c.get('areaKm2'),
        'hist': c['hist'], 'parties': c['parties'], 'mayor2021': c['mayor2021'],
    })
today = datetime.date.today().isoformat()
SRC = [
    ('P2021_1', 'Presidencial 2021, 1ª vuelta (TRICEL)', 'https://www.servel.cl/wp-content/uploads/2022/12/Resultados_Mesa_Presidenciales_1v_2021-1.xlsx', 'definitivo'),
    ('P2021_2', 'Presidencial 2021, 2ª vuelta (TRICEL)', 'https://www.servel.cl/wp-content/uploads/2022/12/Resultados_mesa_presidencial_TRICEL_2v_2021-1.xlsx', 'definitivo'),
    ('D2021', 'Diputados 2021 (TRICEL)', 'https://www.servel.cl/wp-content/uploads/2022/12/Diputados-1.zip', 'definitivo'),
    ('PLEB2022', 'Plebiscito constitucional 2022', 'https://www.servel.cl/wp-content/uploads/2023/01/Resultados-Plebiscito-Constitucional-2022.xlsx', 'definitivo'),
    ('A2021', 'Alcaldes 2021 (TER)', 'https://www.servel.cl/wp-content/uploads/2022/12/Definitivos_Alcalde_2021.zip', 'definitivo'),
    ('P2025_1', 'Presidencial 2025, 1ª vuelta (preliminar)', 'https://www.servel.cl/wp-content/uploads/2025/11/PRELIMINARES_PRESIDENTE_DE_LA_REPUBLICA.zip', 'preliminar'),
    ('P2025_2', 'Presidencial 2025, 2ª vuelta (preliminar)', 'https://www.servel.cl/wp-content/uploads/2025/12/Datos_SegundaVotacion-1.zip', 'preliminar'),
    ('D2025', 'Diputados 2025 (preliminar)', 'https://www.servel.cl/wp-content/uploads/2025/11/PRELIMINARES_DIPUTADOS.zip', 'preliminar'),
    ('PADRON2023', 'Padrón electoral definitivo dic. 2023 por comuna y edad', 'https://www.servel.cl/wp-content/uploads/2024/09/PADRON_DEFINITIVO_DICIEMBRE_2023_TOTAL_POR_COMUNA_SEXO_Y_RANGO_EDAD.xlsx', 'definitivo'),
    ('CENSO2024', 'INE Censo 2024, tabulados comunales (D1, P2, P6, P7, D4, H1)', 'https://censo2024.ine.gob.cl/estadisticas/', 'definitivo'),
    ('DPA', 'MOP — Servicio DPA (comunas, provincias, regiones; geometría)', 'https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer', 'oficial'),
]
seats_meta = {e['id']: e['seats'] for e in history if e['type'] == 'diputados'}
for eid, st in seats_meta.items(): print('escaños', eid, sum(sum(x.values()) for x in st.values()))
meta = {'seats': seats_meta, 'generated': today, 'sources': [{'id': a, 'label': b, 'url': u, 'consulted': '2026-11-06', 'status': s} for a, b, u, s in SRC],
        'notes': ['Antártica (12202) no tiene polígono en la capa del MOP; se incluye en datos y tablas, no en el mapa.',
                  'Bloques (izq/centro/der/pop/otro): clasificación del autor para comparar elecciones; no implica identificación ideológica individual.',
                  'Resultados 2025: preliminares del SERVEL (no TRICEL).']}
json.dump({'meta': meta, 'comunas': out}, open(f'{OUTDIR}/comunas.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'meta': meta, 'elections': history}, open(f'{OUTDIR}/history.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(geo, open(f'{OUTDIR}/geometry.json', 'w'), separators=(',', ':'))
print('ok', len(out))
