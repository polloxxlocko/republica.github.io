# Pruebas

## Unitarias e integración (Vitest)

```bash
npm test
```

| Archivo | Cubre |
|---|---|
| `tests/dhondt.test.ts` | D'Hondt, topes de candidaturas, cocientes, pactos |
| `tests/core.test.ts` | PRNG con semilla, fechas, escenario (15 partidos, históricos, 155+50 escaños), creación de personaje, los 9 puntos de partida, avance temporal sin mutación, **determinismo**, consumo de PA |
| `tests/elections.test.ts` | Diputados (155 electos, porcentajes que suman 100, sin duplicados), regla de 2ª vuelta, subpactos, **ciclo completo** (municipales con 346 alcaldías → primarias → parlamentarias → presidencial → cambio de mando) y subsistencia legal |
| `tests/institutions.test.ts` | Quórums, voto individual por ideología, efecto de la negociación, tramitación completa (aprobación y rechazo), veto/insistencia 2/3, estimación de escaños, formar/unirse/salir de coaliciones, ciclo de políticas, autonomía del Banco Central, investidura |
| `tests/player.test.ts` | Quien preside el partido compite con ventaja en el proceso (sin nominación asegurada), requisitos (mociones, edad), fundación de partido (en formación → constituido), decisiones pendientes, enfriamiento de eventos |
| `tests/career.test.ts` | **Modo carrera**: inicio sin cargos ni liderazgo, organización comunitaria inicial, ausencia de candidaturas automáticas, transiciones aspirante → preselección → decisión, un cargo por fecha, residencia, consecuencias distintas según la decisión, vencimiento de oportunidades, incumplimiento de compromisos y memoria, oportunidades emergentes (sin ministerios para jóvenes sin trayectoria), voto propio en sala, incompatibilidades, rendimientos decrecientes, legado sin Presidencia, trayectorias distintas por semilla y decisiones |
| `tests/uncertainty.test.ts` | **Incertidumbre**: la interfaz solo recibe descripciones sin cifras, el error de percepción disminuye con el conocimiento, los informes se verifican y construyen el historial de las fuentes, los mensajes no revelan valores internos, las situaciones latentes pueden disiparse, una relación antigua hace que una figura que ascendió te elija (memoria de largo plazo) y sin relación elige a otra persona, escaño vacante designado por el partido (art. 51) y reemplazo si declinas, un perfil técnico excepcional puede llegar al gabinete sin cargos previos, solo hay requisitos legales, derrota estrecha frente a derrota amplia, presión por éxito prematuro según la experiencia, más competencia interna en partidos grandes, agenda personal (tiempo frente a ingresos), trayectorias de contactos, hitos biográficos reales |
| `tests/agenda.test.ts` | Agenda semanal: un catálogo de 80 actividades, agenda inicial, cambio semanal sin repetir la semana anterior (35 o más actividades distintas en 20 semanas), costo y uso único con vencimiento semanal, ejecución sin errores de todo el catálogo, fechas del calendario cívico, disponibilidad según el cargo, acciones permanentes que dependen de la semana, honorarios del equipo y salida por falta de recursos |
| `tests/persistence.test.ts` | Exportar/importar sin pérdida, migraciones (incluida v4 → v5 del modo carrera), rechazo de archivos corruptos y de versiones futuras, reparación, IndexedDB (con `fake-indexeddb`) |
| `tests/territory.test.ts` | 346 comunas con distrito y padrón, coherencia distrito-región (Ley 20.840), escaños oficiales 2025 = magnitudes legales, concejales 6/8/10, ajuste de calibración (modo juego), **validación fuera de muestra 2021-22 → 2025** (genera `territory-validation.json`), deriva ideológica acotada, efecto verificable y decreciente de la inversión territorial, explicaciones, 346 alcaldías por comuna |
| `tests/perf.test.ts` | Igualdad exacta entre la utilidad optimizada y la suma de componentes (base de las explicaciones); rendimiento semanal (~45 ms) |
| `tests/longrun.test.ts` | **24 años** (6 ciclos): invariantes cada 26 semanas, economía acotada, alternancia, rendimiento (< 150 ms/semana; medido ~40 ms) y tamaño del estado |

Invariantes verificados (`src/game/engine/invariants.ts`): 155/50 escaños, sin titulares duplicados ni en ambas cámaras, titulares activos con su cargo, coaliciones con miembros válidos y sin repetir, un único Presidente, calendario ordenado, porcentajes que suman 100, electos ≤ escaños, votos ≤ miembros, recursos no negativos, economía finita, partidos disueltos inactivos.

## Extremo a extremo (Playwright)

```bash
npm run build
```

```bash
npm run test:e2e
```

- Crea un personaje desde cero (identidad, origen, afiliación), ejecuta una acción con costo, recorre la pantalla Carrera (oportunidades, candidaturas, biografía, legado), avanza el calendario, resuelve decisiones, recorre todas las pantallas, abre el detalle de un partido y el hemiciclo, guarda, recarga y continúa sin errores de consola.
- Avanza hasta la primera elección y recorre la noche electoral hasta el resultado final.

Si un proyecto fija otra versión de `@playwright/test`, usa el Chromium del sistema con `executablePath`.

## Diagnóstico de carreras

```bash
SEEDS=1,2,3 YEARS=6 npx vite-node scripts/career-sim.ts
```

Simula a una joven de 22 años con una política de juego simple y muestra sus cargos, sus nominaciones, su capital final, las oportunidades vistas y su biografía. Sirve para detectar ascensos irreales o capital saturado.

Resultado del diagnóstico con la versión final (4 semillas × 8 años, con un bot que repite todas las acciones cada semana y acepta todo): una carrera pierde por poco en 2029 y llega a la Cámara a los 29; otra suma cuatro derrotas y queda como operadora partidaria; dos llegan a la Cámara a los 25. Una persona que juega con menos intensidad progresa más lento.

## Balance (simulación masiva)

```bash
npm run balance
```

Variables `BALANCE_SEEDS` (por defecto 10) y `BALANCE_YEARS` (por defecto 12). Genera `balance-report.json` y verifica:

- Ningún partido gana más del 75% de las presidenciales.
- Inflación < 20%, crecimiento entre −9% y 9%.
- Al menos 5 partidos activos en promedio.
- Tasa de alternancia > 20%.
- Menos de 25 crisis por década.

Última ejecución (8 semillas × 12 años, parámetros finales de esta versión):

| Métrica | Valor |
|---|---|
| Presidencias ganadas | REP 11, FA 7, PS 2, RN 1, PC 1, PPD 1, UDI 1 |
| Mayor bancada en la Cámara | FA 16 veces, REP 8 veces |
| Tasa de alternancia de bloque | 87,5% |
| Partidos activos al final (promedio) | 9 (incluye nuevos partidos surgidos en la partida) |
| Inflación máxima | 4,0% |
| Crecimiento (mín./máx.) | −1,1% / 4,3% |
| Crisis por década | 9,4 |
| Mayor variación de escaños de un partido entre elecciones | 25 |

**Hallazgos de balance abiertos:**
- La economía sigue siendo más estable que la chilena histórica (pocas recesiones profundas). Se puede aumentar la volatilidad de los shocks externos en `economy.ts` y `events.ts`.
- El FA tiende a ser la mayor bancada en el largo plazo.
- Los partidos con menos de 2% suelen fusionarse con un socio de coalición o disolverse en la primera elección parlamentaria (regla legal de subsistencia). Su supervivencia depende de sus bastiones regionales estimados.

**Balance tras el motor territorial** (4 semillas × 8 años): presidencias PPD 2, RN 2, PS 2, FRVS 1 y UDI 1; alternancia de 87,5%; 12,75 partidos activos en promedio (los partidos con bastiones regionales reales ahora sobreviven); inflación máxima de 3,9%; crecimiento entre −1,0% y 4,5%. En estas semillas el oficialismo republicano inicial no retiene la Presidencia, porque se acumulan desgaste y fatiga.

**Balance tras el modo carrera** (4 semillas × 8 años): presidencias de RN 2, PS 2, PDC 2, FRVS 1 y PNL 1; alternancia de 87,5%; 12,5 partidos activos en promedio; inflación máxima de 3,9%; crecimiento entre 0,0% y 3,9%; 8,75 crisis por década. Los procesos de nominación de la IA (incumbentes, figuras emergentes) no alteran los equilibrios macro.

**Balance tras el sistema de incertidumbre** (4 semillas × 8 años): presidencias de RN 3, PDC 2, FRVS 1, PPD 1 y FA 1; alternancia de 87,5%; 12,5 partidos activos en promedio; inflación máxima de 3,9%.
