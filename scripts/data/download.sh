#!/usr/bin/env bash
# Descarga las fuentes oficiales del motor territorial a .cache/territory (no se versiona).
# Uso: bash scripts/data/download.sh   (luego: bash scripts/data/build.sh)
set -euo pipefail
RAW=.cache/territory/raw; GEO=.cache/territory/geo
mkdir -p "$RAW" "$GEO"
S=https://www.servel.cl/wp-content/uploads
I=https://censo2024.ine.gob.cl/wp-content/uploads
fetch() { # descarga reanudable con reintentos (el servidor corta conexiones largas)
  local url=$1 out=$2
  for i in $(seq 1 30); do
    curl -sS --http1.1 -m 300 -C - -o "$out" "$url" && python3 -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).testzip()" "$out" 2>/dev/null && return 0
    sleep 2
  done
  echo "No se pudo descargar $url" >&2; return 1
}
for u in 2022/12/Resultados_Mesa_Presidenciales_1v_2021-1.xlsx 2022/12/Resultados_mesa_presidencial_TRICEL_2v_2021-1.xlsx \
         2022/12/Diputados-1.zip 2023/01/Resultados-Plebiscito-Constitucional-2022.xlsx 2022/12/Definitivos_Alcalde_2021.zip \
         2024/09/PADRON_DEFINITIVO_DICIEMBRE_2023_TOTAL_POR_COMUNA_SEXO_Y_RANGO_EDAD.xlsx 2025/11/PRELIMINARES_DIPUTADOS.zip \
         2025/11/PRELIMINARES_PRESIDENTE_DE_LA_REPUBLICA.zip 2025/12/Datos_SegundaVotacion-1.zip; do
  [ -f "$RAW/$(basename $u)" ] || fetch "$S/$u" "$RAW/$(basename $u)"
done
for u in 2025/03/D1_Poblacion-censada-por-sexo-y-edad-en-grupos-quinquenales.xlsx 2025/06/P7_Educacion.xlsx 2025/04/D4_Inmigracion-Internacional.xlsx \
         2025/06/P2-Pueblos-indigenas.xlsx 2025/06/P6_Religion-o-credo.xlsx 2025/05/H1_Servicios-basicos-hogar-y-tenencia-vivienda.xlsx; do
  [ -f "$RAW/$(basename $u)" ] || fetch "$I/$u" "$RAW/$(basename $u)"
done
M="https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer/1/query"
for r in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do
  [ -f "$GEO/geo_$r.json" ] || curl -sS -m 180 -o "$GEO/geo_$r.json" "$M?where=CUT_REG%3D%27$r%27&outFields=CUT_COM,COMUNA&returnGeometry=true&outSR=4326&maxAllowableOffset=0.004&geometryPrecision=3&f=json"
done
echo "Descarga completa en .cache/territory"
