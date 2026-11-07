# Pipeline de datos territoriales

Los archivos de `src/game/data/territory/` se generan con scripts reproducibles a partir de fuentes oficiales. No se editan a mano.

| Paso | Script | Entrada | Salida |
|---|---|---|---|
| 0 | `scripts/data/download.sh` | SERVEL, INE y MOP (HTTPS) | `.cache/territory/raw`, `.cache/territory/geo` |
| 1 | `scripts/data/aggregate_servel.py` | Planillas por mesa del SERVEL | `agg.json`: votos por comuna y opción, más electores, nulos, blancos y electos |
| 2 | `scripts/data/demographics.py` | Tabulados del Censo 2024, padrón 2023 y polígonos del MOP | `demo.json` (346 comunas) y `geo_simpl.json` (Douglas-Peucker) |
| 3 | `scripts/data/build_territory.py` | Pasos 1 y 2 | `comunas.json` (motor), `history.json` y `geometry.json` (carga diferida en la interfaz) |

Para ejecutar el pipeline completo:

```bash
bash scripts/data/download.sh
```

```bash
bash scripts/data/build.sh
```

Notas:

- El servidor del SERVEL corta descargas largas, así que `download.sh` reanuda (`curl -C -`) y verifica la integridad del ZIP.
- Algunas planillas de alcaldes 2021 traen una hoja de estilos inválida. El paso 1 la ignora, porque los estilos no se usan.
- Los encabezados varían entre archivos (`Mesa Nº`, `Nro. Mesa`, `Votos`, `Votos TER`, etc.). El paso 1 contempla las variantes conocidas.
- Los nombres de comunas se unen por código CUT entre INE y MOP. Con el SERVEL se unen por nombre normalizado, con alias conocidos (Llay-Llay, Aysén, Coyhaique, Paiguano, Trehuaco, Marchigüe, La Calera, Tiltil).
- Cada elección agregada se guarda en caché (`agg.json.<ID>.json`). Para reprocesar una elección, borra su archivo de caché.
- Para agregar una elección: incorpora su descarga y una llamada `run(...)` en el paso 1. Luego agrégala a `SRC` y, si corresponde, a `REFERENCE` en `src/game/territory/model.ts`, y vuelve a ejecutar las pruebas (`tests/territory.test.ts`).
