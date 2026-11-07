# Datos políticos: fuentes, verificación y naturaleza

## Política de datos

- **No se inventan** resultados electorales, composición parlamentaria, autoridades ni cifras demográficas presentados como históricos.
- Cada conjunto de datos declara `source`, `cutoff`, `consulted`, `confidence`, `nature` (`documentado` | `estimado` | `simulado` | `aportado_por_usuario`) y `version`. Se muestran en la ficha de cada partido y en la pantalla *Partida*.
- Todos los **personajes son ficticios** (nombres generados a partir de nombres y apellidos frecuentes).
- Los medios y las encuestadoras son **ficticios** para no atribuir noticias falsas a medios reales.

## Verificación en esta versión

**Consulta a SERVEL realizada el 06-11-2026** (fecha de corte publicada: 30-09-2026):

- **Partidos constituidos** (https://www.servel.cl/partidos-politicos/partidos-constituidos/): los 15 partidos del catálogo coinciden exactamente con el registro. Se incorporó la **fecha de constitución legal** de cada uno (campo `constitutedOn`), distinta de la fecha histórica de fundación. Cambio aplicado: el nombre oficial registrado es **"Partido Republicano"** (antes figuraba como "Partido Republicano de Chile").
- **Partido Cristiano de Chile**: constituido el 23-07-2026 según SERVEL. Su orientación y atributos siguen siendo estimados.
- **Partidos en formación** (https://www.servel.cl/partidos-politicos/partidos-en-formacion/): **Ecologista Verde Animalista**. Se agregó al catálogo como `en_formacion` (no compite al inicio). SERVEL no publica su sigla y la etiqueta corta del juego no es oficial.
- **Siglas**: SERVEL no las lista. Se usan las siglas de uso común, sin inventar siglas oficiales.
- Partidos históricos o en otra situación jurídica (PSC, PH, Acción Humanista, Demócratas, Amarillos, PEV, AVP, Igualdad, Partido Popular, PTR, Patria Progresista, Sentido Común, PRO, Partido Nacional de 1966): no figuran como constituidos ni en formación al corte. Su historia específica (disolución, caducidad, etc.) **no se verificó** caso a caso.
- Revolución Democrática, Convergencia Social y Comunes se registran como **fusionados** en el Frente Amplio (constituido como partido el 02-07-2024).

## Datos documentados (confianza media-alta)

- 16 regiones, sus capitales y número de comunas (346 en total).
- 28 distritos de diputados con su magnitud (155 escaños) y 16 circunscripciones senatoriales (50 escaños), según la Ley 20.840.
- Reglas: segunda vuelta presidencial por mayoría absoluta, umbral de 40% para gobernador regional, requisitos de edad (Presidente y senador 35, diputado 21), límites de reelección (Ley 21.238), voto obligatorio, D'Hondt con pactos y subpactos, veto e insistencia por 2/3, Ley de Presupuestos (art. 67 CPR) e incompatibilidad entre cargo parlamentario y ministerio.
- Nombres de los 25 ministerios.

## Datos aproximados (confianza media o baja)

- Población regional: aproximada al **Censo 2024**, redondeada.
- **Grupos de renovación del Senado** (qué circunscripciones eligen en 2029 y cuáles en 2033): aproximación configurable en `geography.ts` (`senateGroup`). **Verificar.**
- Quórum de leyes orgánicas: modelado como 4/7 y configurable en `QUORUMS`. **Verificar la normativa vigente.**
- Subsistencia legal de partidos: aproximación a la Ley 18.603 art. 56. Exige 5% en 8 regiones o en 3 regiones contiguas, salvo que el partido elija 4 parlamentarios. Se asume que cada partido está constituido en todas las regiones.

## Datos territoriales y electorales oficiales (desde la versión 0.2)

Ver [TERRITORY.md](TERRITORY.md) y [DATA_PIPELINE.md](DATA_PIPELINE.md). Se incorporaron:

- Resultados oficiales del SERVEL por comuna: presidenciales 2021 (1ª y 2ª vuelta), diputados 2021, plebiscito 2022, alcaldes 2021, y presidenciales y diputados 2025 (preliminares).
- Las 346 comunas con provincia, distrito y circunscripción.
- Padrón 2023 por edad.
- Censo 2024 (INE).
- Polígonos oficiales del MOP.

La **Cámara inicial** usa ahora la distribución oficial (preliminar) de escaños 2025 por partido y distrito. El apoyo comunal de los partidos se calibra con la votación de diputados 2025.

## Datos simulados del escenario Chile 2026

- Composición inicial del **Senado**: simulada (D'Hondt sobre el apoyo calibrado). La **Cámara** usa los escaños oficiales preliminares de 2025 por partido y distrito; todas las personas son ficticias.
- Gobierno incumbente: personaje ficticio del Partido Republicano, coalición "Alianza de Gobierno". Coaliciones iniciales: "Alianza de Gobierno" y "Bloque Progresista" (nombres del juego, no pactos reales).
- Alcaldías, gobernadores y aprobación presidencial iniciales: simulados.
- Economía inicial: valores aproximados de órdenes de magnitud plausibles (crecimiento, IPC, desempleo, TPM, cobre, deuda), no cifras oficiales a una fecha.
- Ideología multidimensional, militancia, recursos, organización territorial, bastiones regionales y facciones: **parámetros de balance estimados**.

## Pendiente

1. Verificar caso a caso la situación jurídica de los partidos históricos (página de trámites y caducidades de SERVEL).
2. Incorporar resultados de municipales y gobernadores 2024 y del Senado 2025 cuando estén disponibles como archivos.
3. Confirmar los grupos de renovación senatorial y el quórum de leyes orgánicas.
4. Datos verificados para escenarios históricos. No se deben aplicar las reglas actuales a 1990-2013, que usaban el sistema binominal.

## Personas reales del escenario 2026

Datos en `src/data/characters/` (`realPoliticians.ts`, `politicalCareers.ts`, `partyLeadership.ts`, `territorialAuthorities.ts`, `historicalSources.ts`). Se generan con:

```bash
bash scripts/data/download_politicians.sh /tmp/republica-data/real
```

```bash
python3 scripts/data/build_politicians.py /tmp/republica-data/real src/data/characters/generated.json
```

Fuentes consultadas el 7-11-2026:

| Dato | Fuente | Cobertura |
|---|---|---|
| Presidente de la República | SERVEL, segunda votación del 14-12-2025 (Kast 7.235.213; Jara 5.186.244) y Cámara (fecha de nacimiento) | completa |
| Diputadas y diputados 2026-2030 | Cámara, datos abiertos (nombre, fecha de nacimiento, militancias con fechas, períodos desde 1990) + SERVEL 2025 (distrito, columna «electo») | 155/155 |
| Senado | SERVEL 2025 (columna «electo»); 2021: votos TRICEL con D'Hondt calculado, aceptado solo si es robusto | 47/50. Biobío (3 escaños) quedó ambiguo y es ficticio. La militancia de los electos en 2021 es la de esa elección; no se pudo verificar la composición vigente contra senado.cl, que bloquea el acceso automatizado |
| Directivas centrales | Resoluciones de SERVEL de los 16 partidos constituidos (fecha de publicación de cada una) | 16/16. Los cargos vacantes se mantienen vacantes (p. ej., la presidencia del PR) |
| Ministros | Sitios oficiales de cada ministerio (consulta del 7-11-2026) | 5/25 confirmados (Interior, Defensa, Trabajo, Bienes Nacionales y Culturas). El resto son titulares ficticios: gob.cl y varios ministerios bloquean el acceso automatizado, y la lista de prensa de marzo de 2026 ya está desactualizada |
| Gobernadores y alcaldes | — | Pendientes: SERVEL no publica los resultados de 2024 en un formato verificable. Son ficticios |

Reglas:
- No se inventa ningún dato. Una fecha de nacimiento sin fuente queda como «no documentada», y el motor usa una edad convencional marcada como tal. Los nombres de las directivas se conservan como figuran en la resolución de SERVEL.
- Identificador estable independiente del partido (`cl-cam-<id Cámara>` o un identificador derivado del nombre), con deduplicación entre fuentes por nombre de pila y apellidos.
- Los datos verificados (`src/data/characters`) y la historia simulada (estado de la partida) se guardan por separado. La ficha de cada personaje muestra ambos bloques por separado.
- Convenciones de simulación: atributos uniformes según el cargo, ideología igual a la del partido, sin personalidad, sin escándalos, sin fallecimientos (solo retiro voluntario simulado al no tener cargo) y relaciones iniciales neutras.
- Acceso: el jugador no puede reunirse libremente con figuras nacionales (`src/game/career/access.ts`).
- Las conversaciones y situaciones con personas reales se rotulan como simuladas. Hay un aviso general en el menú, en la creación de personaje y en la pantalla Partida.
