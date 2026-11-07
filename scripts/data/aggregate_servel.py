"""
Paso 1 del pipeline territorial: agrega resultados OFICIALES del SERVEL (por mesa) a nivel comuna.

Uso:  python3 scripts/data/aggregate_servel.py <dir_con_archivos_descargados> <salida.json>
Cada elección se guarda además en <salida>.<ID>.json (caché: si existe, no se reprocesa).
Los archivos se descargan con scripts/data/download.sh (ver DATA_PIPELINE.md).
No requiere red. Solo usa la biblioteca estándar + openpyxl.
"""
import sys, os, io, json, zipfile, re, unicodedata
import openpyxl
import openpyxl.reader.excel as _xl
_orig_apply = _xl.apply_stylesheet
def _safe_apply(archive, wb):
    # Algunos archivos del SERVEL traen una hoja de estilos inválida; los estilos no se necesitan.
    try: return _orig_apply(archive, wb)
    except Exception: return wb
_xl.apply_stylesheet = _safe_apply

RAW = sys.argv[1]
OUT = sys.argv[2]

def norm(s):
    if s is None: return ''
    s = str(s).strip().upper()
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', s)

def rows_of(fobj):
    wb = openpyxl.load_workbook(fobj, read_only=True, data_only=True)
    for ws in wb.worksheets:
        it = ws.iter_rows(values_only=True)
        header = None
        for row in it:
            if header is None:
                if row and any(isinstance(c, str) and ('Comuna' in c or c == 'comuna') for c in row if c):
                    header = [norm(c) for c in row]
                continue
            if not any(row): continue
            yield ws.title, header, row

def num(v):
    try: return int(v) if v is not None and v != '' else 0
    except (TypeError, ValueError):
        try: return int(float(v))
        except Exception: return 0

class Agg:
    """Agrega votos por comuna y opción; registra electores por mesa (sin doble conteo)."""
    def __init__(self, eid, meta):
        self.eid = eid; self.meta = meta
        self.comunas = {}   # comuna -> dict
        self.mesas = set()
        self.options = {}   # key -> {label, party, pact}
    def add(self, region, provincia, circ, distrito, comuna, mesa_key, electores, opt_key, opt_label, party, pact, votes, elected=None):
        c = self.comunas.setdefault(comuna, {'region': region, 'provincia': provincia, 'circ': circ, 'distrito': distrito, 'electores': 0, 'nulos': 0, 'blancos': 0, 'votes': {}, 'electos': {}})
        if mesa_key not in self.mesas:
            self.mesas.add(mesa_key); c['electores'] += num(electores)
        if opt_key == 'NULOS': c['nulos'] += votes; return
        if opt_key == 'BLANCOS': c['blancos'] += votes; return
        c['votes'][opt_key] = c['votes'].get(opt_key, 0) + votes
        if opt_key not in self.options: self.options[opt_key] = {'label': opt_label, 'party': party, 'pact': pact}
        if elected: c['electos'][opt_key] = 1
    def out(self):
        return {'id': self.eid, **self.meta, 'options': self.options, 'comunas': self.comunas}

def classify(label):
    l = norm(label)
    if 'NULO' in l: return 'NULOS'
    if 'BLANCO' in l: return 'BLANCOS'
    return None

def idx(header, *names):
    for n in names:
        n2 = norm(n)
        if n2 in header: return header.index(n2)
    raise KeyError(names)

def old_format(agg, fobj, opt_col_names, party_col=None, pact_col=None, vote_col_names=('VOTOS TRICEL', 'VOTOS TER')):
    for sheet, h, r in rows_of(fobj):
        if 'EXTRANJ' in norm(sheet): continue
        try:
            i_reg, i_prov, i_cs, i_dis, i_com = idx(h, 'Región', 'Region'), idx(h, 'Provincia'), idx(h, 'Circ. Senatorial', 'CS'), idx(h, 'Distrito'), idx(h, 'Comuna')
            i_mesa = idx(h, 'Nro. Mesa', 'Mesa', 'Nº Mesa', 'N° Mesa', 'Mesa Nº')
            i_loc = h.index(norm('Local')) if norm('Local') in h else idx(h, 'Circ. Electoral', 'Circunscripción')
            i_el = h.index(norm('Electores')) if norm('Electores') in h else None
            i_opt = idx(h, *opt_col_names)
            i_v = idx(h, *vote_col_names)
        except KeyError:
            continue
        i_party = idx(h, party_col) if party_col and norm(party_col) in h else None
        i_pact = idx(h, pact_col) if pact_col and norm(pact_col) in h else None
        i_fus = h.index(norm('Mesas Fusionadas')) if norm('Mesas Fusionadas') in h else (h.index(norm('Fusionadas')) if norm('Fusionadas') in h else None)
        label = r[i_opt]
        cls = classify(label)
        party = norm(r[i_party]) if i_party is not None else ''
        key = cls or (norm(label) if not party else f"{norm(label)}|{party}")
        mesa_key = (norm(r[i_com]), norm(r[i_loc]), str(r[i_fus] if i_fus is not None else r[i_mesa]))
        agg.add(norm(r[i_reg]), norm(r[i_prov]), num(r[i_cs]), num(r[i_dis]), norm(r[i_com]), mesa_key, r[i_el] if i_el is not None else 0, key, str(label).strip(), party, norm(r[i_pact]) if i_pact is not None else '', num(r[i_v]))

def new_format(agg, fobj):
    for sheet, h, r in rows_of(fobj):
        g = lambda n: r[h.index(norm(n))]
        label = g('nombre_candidato'); cls = classify(label)
        party = norm(g('partido')); pact = norm(g('pacto'))
        key = cls or f"{norm(label)}|{party}"
        circ = num(re.sub(r'\D', '', str(g('circunscripcion_senatorial'))) or 0)
        dist = num(re.sub(r'\D', '', str(g('distrito'))) or 0)
        el = g('electo_nominado')
        agg.add(norm(g('region')), '', circ, dist, norm(g('comuna')), (norm(g('comuna')), str(g('cod_mesa'))), g('electores'), key, str(label).strip(), party, pact, num(g('votos_preliminares')), elected=(el == 1 and not cls))

def zip_members(path):
    z = zipfile.ZipFile(path)
    for n in sorted(z.namelist()):
        if n.endswith('.xlsx') and 'xtranjero' not in n:
            yield n, io.BytesIO(z.read(n))

R = lambda f: os.path.join(RAW, f)
elections = []

def run(eid, meta, fn):
    cache = f"{OUT}.{eid}.json"
    if os.path.exists(cache):
        elections.append(json.load(open(cache))); print('caché', eid, flush=True); return
    print('procesando', eid, flush=True)
    a = Agg(eid, meta); fn(a); o = a.out(); elections.append(o)
    json.dump(o, open(cache, 'w'), ensure_ascii=False)
    print('  comunas', len(a.comunas), 'opciones', len(a.options), flush=True)

run('P2021_1', {'type': 'presidencial', 'date': '2021-11-21', 'status': 'definitivo (TRICEL)', 'source': 'SERVEL Resultados_Mesa_Presidenciales_1v_2021-1.xlsx', 'split': 'calibracion'},
    lambda a: old_format(a, R('Resultados_Mesa_Presidenciales_1v_2021-1.xlsx'), ('Candidato',)))
run('P2021_2', {'type': 'presidencial_2v', 'date': '2021-12-19', 'status': 'definitivo (TRICEL)', 'source': 'SERVEL Resultados_mesa_presidencial_TRICEL_2v_2021-1.xlsx', 'split': 'calibracion'},
    lambda a: old_format(a, R('Resultados_mesa_presidencial_TRICEL_2v_2021-1.xlsx'), ('Candidato',)))
def dip21(a):
    for n, f in zip_members(R('Diputados-1.zip')): old_format(a, f, ('Candidato',), party_col='Partido', pact_col='Pacto')
run('D2021', {'type': 'diputados', 'date': '2021-11-21', 'status': 'definitivo (TRICEL)', 'source': 'SERVEL Diputados-1.zip', 'split': 'calibracion'}, dip21)
run('PLEB2022', {'type': 'plebiscito', 'date': '2022-09-04', 'status': 'definitivo (TRICEL)', 'source': 'SERVEL Resultados-Plebiscito-Constitucional-2022.xlsx', 'split': 'calibracion'},
    lambda a: old_format(a, R('Resultados-Plebiscito-Constitucional-2022.xlsx'), ('Opción',)))
def alc21(a):
    for n, f in zip_members(R('Definitivos_Alcalde_2021.zip')): old_format(a, f, ('Candidato',), party_col='Partido', pact_col='Pacto', vote_col_names=('Votos TER', 'VOTOS TER', 'Votos'))
run('A2021', {'type': 'alcaldes', 'date': '2021-05-16', 'status': 'definitivo (TER)', 'source': 'SERVEL Definitivos_Alcalde_2021.zip', 'split': 'calibracion'}, alc21)
def zipnew(path):
    def f(a):
        for n, fo in zip_members(path): new_format(a, fo)
    return f
run('P2025_1', {'type': 'presidencial', 'date': '2025-11-16', 'status': 'preliminar (SERVEL)', 'source': 'SERVEL PRELIMINARES_PRESIDENTE_DE_LA_REPUBLICA.zip', 'split': 'validacion'}, zipnew(R('PRELIMINARES_PRESIDENTE_DE_LA_REPUBLICA.zip')))
run('P2025_2', {'type': 'presidencial_2v', 'date': '2025-12-14', 'status': 'preliminar (SERVEL)', 'source': 'SERVEL Datos_SegundaVotacion-1.zip', 'split': 'validacion'}, zipnew(R('Datos_SegundaVotacion-1.zip')))
run('D2025', {'type': 'diputados', 'date': '2025-11-16', 'status': 'preliminar (SERVEL)', 'source': 'SERVEL PRELIMINARES_DIPUTADOS.zip', 'split': 'validacion'}, zipnew(R('PRELIMINARES_DIPUTADOS.zip')))

json.dump(elections, open(OUT, 'w'), ensure_ascii=False)
print('listo', OUT)
