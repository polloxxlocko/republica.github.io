#!/usr/bin/env bash
# Procesa las fuentes descargadas y regenera src/game/data/territory/*.json (requiere python3 + openpyxl).
set -euo pipefail
C=.cache/territory; OUT=src/game/data/territory
mkdir -p "$OUT"
python3 -I scripts/data/aggregate_servel.py "$C/raw" "$C/agg.json"
python3 -I scripts/data/demographics.py "$C/raw" "$C/geo" "$C/demo.json" "$C/geo_simpl.json"
python3 -I scripts/data/build_territory.py "$C/agg.json" "$C/demo.json" "$C/geo_simpl.json" "$OUT"
