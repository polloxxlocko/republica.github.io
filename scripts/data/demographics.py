"""
Paso 2: une datos demográficos OFICIALES por comuna (código CUT de 5 dígitos).
  - INE Censo 2024 (tabulados): población, educación, escolaridad, inmigración, pueblos indígenas, religión, leña, internet.
  - SERVEL padrón definitivo dic. 2023: electores por tramo de edad.
  - MOP (SERVICIO_DPA): nombres, provincia y área (para densidad) y geometría simplificada.
Uso: python3 scripts/data/demographics.py <raw_dir> <geo_dir> <salida.json> <geometria.json>
"""
import sys, os, json, re, unicodedata, math
import openpyxl
RAW, GEO, OUT, GEO_OUT = sys.argv[1:5]

def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '').strip().upper())
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("'", '').replace('-', ' ')
    return re.sub(r'\s+', ' ', s)

ALIAS = {'LLAILLAY': 'LLAY LLAY', 'PAIGUANO': 'PAIHUANO', 'AISEN': 'AYSEN', 'TREHUACO': 'TREGUACO', 'MARCHIHUE': 'MARCHIGUE', 'CALERA': 'LA CALERA', 'COIHAIQUE': 'COYHAIQUE', 'ANTARTICA': 'ANTARTICA', 'OHIGGINS': 'OHIGGINS', 'TILTIL': 'TIL TIL', 'TIL TIL': 'TIL TIL', 'CABO DE HORNOS(EX NAVARINO)': 'CABO DE HORNOS', 'SAN PEDRO DE ATACAMA': 'SAN PEDRO DE ATACAMA'}
def key(name): n = norm(name); return ALIAS.get(n, n)

def sheet_rows(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]; header = None
    for row in ws.iter_rows(values_only=True):
        if header is None:
            if row and row[0] == 'Código región': header = list(row)
            continue
        if row and isinstance(row[4], (int, float)) and row[4] > 1000: yield dict(zip(header, row))

def find(path, prefix): return os.path.join(RAW, [f for f in os.listdir(RAW) if f.startswith(prefix)][0])

C = {}
for r in sheet_rows(find(RAW, 'D1_'), '2'):
    cut = int(r['Código comuna']); C[cut] = {'cut': cut, 'name': r['Comuna'], 'regionCode': int(r['Código región']), 'provinceCode': int(r['Código provincia']), 'province': r['Provincia'], 'pop2024': int(r['Población censada'])}
for r in sheet_rows(find(RAW, 'P7_'), '2'):
    c = C[int(r['Código comuna'])]; tot = r['Población censada'] - (r.get('Nivel educativo no declarado') or 0)
    c['eduSuperior'] = round(r['Superior'] / tot, 4); c['eduBasicaOMenos'] = round((r['Nunca asistió'] + r['Diferencial'] + r['Parvularia'] + r['Básica']) / tot, 4)
for r in sheet_rows(find(RAW, 'P7_'), '4'):
    if r.get('Sexo') in ('Total comuna', 'Total Comuna', 'Total'):
        C[int(r['Código comuna'])]['schooling18'] = r['Años de escolaridad promedio para la población de 18 años o más']
# Inmigración: tabla 4 por país; sumar total por comuna
imm = {}
wb = openpyxl.load_workbook(find(RAW, 'D4_'), read_only=True, data_only=True)
hdr = None
for row in wb['4'].iter_rows(values_only=True):
    if hdr is None:
        if row and row[0] == 'Código región': hdr = list(row)
        continue
    if row and isinstance(row[4], (int, float)) and row[4] > 1000 and isinstance(row[7], (int, float)):
        if str(row[6]).lower().startswith('total'): imm[int(row[4])] = row[7]
for cut, v in imm.items(): C[cut]['immigrantShare'] = round(v / C[cut]['pop2024'], 4)
for r in sheet_rows(find(RAW, 'P2-'), '2'):
    c = C[int(r['Código comuna'])]; c['indigenousShare'] = round(r['Población que es o se considera perteneciente a un pueblo indígena u originario'] / c['pop2024'], 4)
for r in sheet_rows(find(RAW, 'P6_'), '2'):
    c = C[int(r['Código comuna'])]; base = r['Población de 15 años o más']
    c['catholicShare'] = round(r['Católica'] / base, 4); c['evangelicalShare'] = round(r['Evangélica o protestante'] / base, 4)
    none = [k for k in r if k and 'Ninguna' in str(k)]
    if none: c['noReligionShare'] = round((r[none[0]] or 0) / base, 4)
for r in sheet_rows(find(RAW, 'H1_'), '4'):
    if isinstance(r['Leña'], (int, float)) and isinstance(r['Hogares censados'], (int, float)) and r['Hogares censados'] > 0:
        C[int(r['Código comuna'])]['firewoodHeating'] = round(r['Leña'] / r['Hogares censados'], 4)
inet = {}
for r in sheet_rows(find(RAW, 'H1_'), '6'):
    v = r.get('Internet fija')
    if isinstance(v, (int, float)): inet.setdefault(int(r['Código comuna']), {})[str(r['Disponibilidad de equipo o servicio'])] = v
for cut, d in inet.items():
    si, no = d.get('Sí', 0), d.get('No', 0)
    if si + no > 0: C[cut]['fixedInternet'] = round(si / (si + no), 4)
# Padrón 2023 por edad
wb = openpyxl.load_workbook(os.path.join(RAW, 'PADRON_DEFINITIVO_DICIEMBRE_2023_TOTAL_POR_COMUNA_SEXO_Y_RANGO_EDAD.xlsx'), read_only=True, data_only=True)
pad = {}
for row in list(wb.worksheets[0].iter_rows(values_only=True))[1:]:
    if not row or not row[1]: continue
    pad[(key(row[0].replace('DE ', '', 1).replace('DEL ', '', 1)), key(row[1]))] = row
pad_by_name = {}
for (rg, cm), row in pad.items(): pad_by_name.setdefault(cm, []).append(row)
miss = []
for c in C.values():
    rows = pad_by_name.get(key(c['name']), [])
    if len(rows) != 1: miss.append(c['name']); continue
    row = rows[0]
    el = row[4]; a = [x or 0 for x in row[5:14]]
    c['electors2023'] = el; c['femaleShare'] = round(row[2] / el, 4)
    c['ageElectors'] = [round((a[0] + a[1]) / el, 4), round((a[2] + a[3]) / el, 4), round((a[4] + a[5]) / el, 4), round((a[6] + a[7] + a[8]) / el, 4)]  # 18-29, 30-49, 50-69, 70+
print('sin padrón:', miss)
# MOP: área y geometría
area = {}; shapes = {}
for f in sorted(os.listdir(GEO)):
    if not re.match(r'geo_\d\d\.json$', f): continue
    d = json.load(open(os.path.join(GEO, f)))
    for feat in d['features']:
        cut = int(feat['attributes']['CUT_COM']); rings = feat['geometry']['rings']
        shapes[cut] = rings
def ring_area_km2(ring):
    a = 0.0; lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111.32 * math.cos(math.radians(lat0)); ky = 110.57
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % len(ring)]
        a += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return a / 2
def simplify(ring, tol):
    """Douglas-Peucker para anillos cerrados: se parte en el punto más lejano al inicial."""
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring[:]
    if len(pts) < 4: return ring
    def dp(seg):
        if len(seg) < 3: return seg
        (x1, y1), (x2, y2) = seg[0], seg[-1]
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy)
        dmax, idx = 0.0, 0
        for i in range(1, len(seg) - 1):
            px, py = seg[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / L if L > 1e-12 else math.hypot(px - x1, py - y1)
            if d > dmax: dmax, idx = d, i
        if dmax > tol: return dp(seg[:idx + 1])[:-1] + dp(seg[idx:])
        return [seg[0], seg[-1]]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    a = dp(pts[:far + 1]); b = dp(pts[far:] + [pts[0]])
    out = a[:-1] + b
    return out if len(out) >= 4 else ring
geo_out = {}
for cut, rings in shapes.items():
    total = sum(abs(ring_area_km2(r)) for r in rings)
    area[cut] = total
    big = sorted(rings, key=lambda r: -abs(ring_area_km2(r)))
    keep = [r for r in big if abs(ring_area_km2(r)) > max(3, total * 0.02)][:8] or big[:1]
    tol = 0.014 if total > 5000 else 0.004 if total > 300 else 0.0006
    prec = 3 if total > 300 else 4
    geo_out[cut] = [[[round(x, prec), round(y, prec)] for x, y in simplify(r, tol)] for r in keep]
for c in C.values():
    if c['cut'] in area and area[c['cut']] > 0:
        c['areaKm2'] = round(area[c['cut']], 1); c['density'] = round(c['pop2024'] / area[c['cut']], 2)
    else: c['areaKm2'] = None; c['density'] = None
print('comunas censo', len(C), 'con geometría', len([c for c in C.values() if c['cut'] in shapes]))
print('sin geometría', [c['name'] for c in C.values() if c['cut'] not in shapes])
json.dump(sorted(C.values(), key=lambda c: c['cut']), open(OUT, 'w'), ensure_ascii=False)
json.dump({str(k): v for k, v in geo_out.items()}, open(GEO_OUT, 'w'), separators=(',', ':'))
print('geo bytes', os.path.getsize(GEO_OUT))
