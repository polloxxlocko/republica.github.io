#!/usr/bin/env bash
# Descarga las fuentes oficiales de personajes reales (escenario 2026). Uso:
#   bash scripts/data/download_politicians.sh /ruta/cache
#   python3 scripts/data/build_politicians.py /ruta/cache src/data/characters/generated.json
# Requiere: curl, unzip, pdftotext (poppler-utils), python3 + openpyxl.
set -euo pipefail
D=${1:-/tmp/republica-data/real}; mkdir -p "$D" "$D/res" "$D/dipx" "$D/s25" "$D/s21"
CAM=https://opendata.camara.cl/camaradiputados/WServices
curl -sS -m 120 -o "$D/dip.xml" "$CAM/WSDiputado.asmx/retornarDiputadosPeriodoActual"
curl -sS -m 300 -o "$D/dip_all.xml" "$CAM/WSDiputado.asmx/retornarDiputados"
for p in 1 2 3 4 5 6 8 9 10 11; do curl -sS -m 120 -o "$D/per_$p.xml" "$CAM/WSDiputado.asmx/retornarDiputadosXPeriodo?prmPeriodoId=$p"; done
S=https://www.servel.cl/wp-content/uploads
curl -sS -m 900 -o "$D/dip2025.zip" "$S/2025/11/PRELIMINARES_DIPUTADOS.zip" && unzip -o -q "$D/dip2025.zip" -d "$D/dipx"
curl -sS -m 900 -o "$D/sen2025.zip" "$S/2025/11/PRELIMINARES_SENADORES_CIRCUNSCRIPCION.zip" && unzip -o -q "$D/sen2025.zip" -d "$D/s25"
curl -sS -m 900 -o "$D/sen2021.zip" "$S/2022/12/Senadores-1.zip" && unzip -o -q "$D/sen2021.zip" -d "$D/s21"
curl -sS -m 60 -o "$D/pc.html" https://www.servel.cl/partidos-politicos/partidos-constituidos/
grep -o 'href="https://www.servel.cl/wp-content/uploads/[^"]*\.pdf"' "$D/pc.html" | sed 's/href="//;s/"$//' > "$D/res/urls.txt"
(cd "$D/res" && while read -r u; do curl -sS -m 120 -O "$u"; done < urls.txt)
# Candidatos 2025 por distrito con marca de electo
python3 - "$D" <<'PY'
import openpyxl, glob, json, sys
D = sys.argv[1]; out = {}
for f in sorted(glob.glob(f'{D}/dipx/PRELIMINARES_DIPUTADOS_DISTRITO_*.xlsx')):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]; h = None
    for r in ws.iter_rows(values_only=True):
        if h is None: h = {k: i for i, k in enumerate(r)}; continue
        k = r[h['cod_candidato']]
        if k in out:
            if r[h['electo_nominado']]: out[k]['electo'] = 1
            continue
        out[k] = {'distrito': int(str(r[h['distrito']]).split()[-1]), 'pacto': r[h['pacto']], 'subpacto': r[h['subpacto']], 'partido': r[h['partido']], 'nombre': ' '.join(str(r[h['nombre_candidato']]).split()), 'electo': 1 if r[h['electo_nominado']] else 0}
json.dump(list(out.values()), open(f'{D}/cand_dip_2025.json', 'w'), ensure_ascii=False)
PY
echo "Fuentes descargadas en $D"
