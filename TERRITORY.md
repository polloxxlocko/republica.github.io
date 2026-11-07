# Motor electoral territorial

El juego simula el comportamiento electoral en las **346 comunas** de Chile. Las comunas se agregan en provincias, regiones, 28 distritos de diputados y 16 circunscripciones senatoriales. Los datos se calibran con **resultados oficiales del SERVEL** y **datos censales del INE**. Este documento cubre las fuentes, el modelo, la calibración, la validación fuera de muestra, la evolución, la estrategia territorial y sus limitaciones.

## 1. Fuentes oficiales

| Id | Contenido | Estado | Uso |
|---|---|---|---|
| P2021_1 | Presidencial 2021, 1ª vuelta, por mesa | definitivo (TRICEL) | calibración (validación) / historial |
| P2021_2 | Presidencial 2021, 2ª vuelta, por mesa | definitivo (TRICEL) | calibración |
| D2021 | Diputados 2021, por mesa, candidato, partido y pacto | definitivo (TRICEL) | calibración (validación) |
| PLEB2022 | Plebiscito constitucional 2022 | definitivo (TRICEL) | participación con voto obligatorio (validación) |
| A2021 | Alcaldes 2021 | definitivo (TER) | historial; partido del alcalde electo |
| P2025_1 / P2025_2 | Presidencial 2025, 1ª y 2ª vuelta | **preliminar** (SERVEL) | calibración del juego; **reservado** en la validación |
| D2025 | Diputados 2025 | **preliminar** (SERVEL) | calibración del juego; Cámara inicial por partido; **reservado** en la validación |
| PADRON2023 | Padrón definitivo dic. 2023 por comuna y edad | definitivo | electores y estructura etaria |
| CENSO2024 | INE, tabulados comunales: población, educación, escolaridad, inmigración, pueblos indígenas, religión, calefacción, internet | definitivo | covariables |
| DPA | MOP, servicio de División Político-Administrativa (polígonos y códigos CUT) | oficial | mapa, área y densidad |

Las URL exactas y la fecha de consulta están en `src/game/data/territory/comunas.json` (`meta.sources`). La asignación comuna → distrito → circunscripción proviene de los propios archivos de resultados del SERVEL. Una prueba verifica que cada distrito agrupa comunas de su región y que los escaños oficiales suman la magnitud legal.

**No disponibles en esta versión** (no se inventan):

- Municipales y de gobernadores 2024, y gobernadores 2021: no se encontraron como archivos descargables en el sitio del SERVEL. Los alcaldes iniciales del escenario son **simulados**.
- Senado 2025: no se procesó. El Senado inicial sigue siendo simulado.
- Ingresos comunales: no hay tabulado oficial comunal en el Censo. Como aproximación se usan la escolaridad, la educación superior y el acceso a internet fija.
- Urbanización comunal: no está en los tabulados. Se aproxima con la densidad, calculada con el área de los polígonos oficiales.
- Antártica (12202): está en los datos y en las tablas, pero no tiene polígono en la capa del MOP.

## 2. Representación del electorado

Cada comuna tiene **4 segmentos etarios** (18-29, 30-49, 50-69 y 70+), con pesos tomados del padrón 2023. No se usa un votante promedio único. Cada segmento tiene:

- **Ideología en 8 ejes** (ver SIMULATION_RULES.md). Se compone de:
  - Un **componente izquierda-derecha latente**: `z = logit(derecha_comuna) − logit(derecha_nacional)`, donde la derecha se mide en la **segunda vuelta presidencial**. Se usa la segunda vuelta para no inferir la ideología de la votación partidaria. Los coeficientes por eje están en `TERRITORY_COEF.leftRight`.
  - Un **componente antiestablishment**, a partir del voto por candidaturas populistas (Parisi).
  - **Covariables censales con efectos moderados**: evangélicos, católicos y personas sin religión → eje valórico; educación superior → eje ambiental; densidad y región → descentralización.
  - **Diferencias por edad**: los jóvenes son más progresistas en lo valórico y lo ambiental; los mayores, más conservadores y más punitivos.
- **Identificación partidaria** (afinidad en log-odds), calibrada por separado (§3). Así, votar por una candidatura **no** implica mecánicamente compartir la ideología de su partido.
- **Fidelidad**: aumenta con la edad y disminuye con la volatilidad comunal.
- **Sensibilidad económica**: es mayor donde la educación superior es menor.
- **Interés y participación**: participación estructural de la comuna × factor etario.

Atributos comunales:

| Atributo | Cómo se obtiene |
|---|---|
| Malestar local | Sigue al malestar regional, con problemas propios (conectividad) |
| Prioridades | Regionales, más seguridad en comunas densas, energía en las que calefaccionan con leña, pensiones donde hay más adultos mayores, migración donde hay más inmigrantes |
| Proporción de votantes volátiles | Diferencia entre primera y segunda vuelta |
| Sensibilidad a campañas | Crece con la volatilidad |
| Sensibilidad a acontecimientos nacionales | Crece cuando la educación superior es menor |
| Sensibilidad a problemas locales | Mayor en comunas pequeñas o rurales |
| Organización por partido | Calibrada al inicio; luego se mueve con el trabajo territorial |
| Rechazo | Surge del modelo: un segmento rechaza a un partido cuando su utilidad queda por debajo del voto blanco o nulo |

**Los atributos demográficos nunca determinan el voto.** Solo desplazan posiciones medias y el logit conserva la dispersión.

## 3. Función de utilidad electoral

```
U(s,j) = −βI·1,6·dist(ideología_s, ideología_j)                  1. preferencias ideológicas
       + afinidad_s,partido                                       2. identificación partidaria
       + βCand·(calidad−50)/50   (elecciones personales)         3. evaluación del candidato
       + βGob·evalGob·(0,5+sensEcon)·sensNacional − fatiga        4. evaluación del gobierno / 5. economía
       − 0,3·(malestar−40)/40·sensLocal   (oficialismo)          6. prioridades y problemas locales
       + βCamp·√(gasto regional) + 0,5·βTerr·√(MM$/1.000 electores)·sensCampaña·(1−fidelidad/2)   7. campaña
       + βTerr·(organización local − 0,3)
       + popularidad, rechazo y credibilidad del partido          9. acontecimientos
       + shock(opción, región) + shock(opción, comuna)            10. variación estocástica controlada
P(j) = e^U / (Σ e^U + e^U_blanco);   votantes = electores × participación (8)
```

Los coeficientes son calibrables y están en `src/game/rules/params.ts` (`VOTE`) y `src/game/territory/model.ts` (`TERRITORY_COEF`). El desglose por componente (`utilityParts`) alimenta las explicaciones al jugador.

## 4. Calibración

- **Modo juego** (escenario de noviembre de 2026): usa todo lo anterior al inicio. El componente izquierda-derecha pondera 70% la 2ª vuelta de 2025 y 30% la de 2021. El componente populista viene de la 1ª vuelta 2025, la participación de 2025 y las afinidades partidarias de diputados 2025.
- **Modo validación**: usa **solo 2021-2022**. El componente izquierda-derecha viene de la 2ª vuelta 2021, el populista de la 1ª vuelta 2021, la participación del plebiscito 2022 (primera elección con voto obligatorio) y las afinidades de diputados 2021.
- Procedimiento: (1) se construyen los segmentos; (2) se centra el electorado en el centro ponderado de la oferta partidaria; (3) se ajusta un intercepto por partido y comuna (22 iteraciones) para reproducir la votación de diputados; (4) se **contrae 20% hacia la media regional**, atribuyendo parte de las diferencias locales a candidaturas y no a identidad; (5) los partidos sin lista en una comuna reciben un piso igual al 25% de su media regional, para que puedan tener presencia futura.
- Error de ajuste en el modo juego (MAE comunal por partido, ponderado por electores): ver `s.territoryCalibration.fitMAE` y la tabla de §5.

## 5. Validación fuera de muestra (2021-2022 → 2025)

La prueba `tests/territory.test.ts` genera `territory-validation.json`. Se informan cuatro métricas:

- **MAE**: error absoluto medio comunal ponderado por electores, en puntos porcentuales.
- **MAE sin swing**: el MAE tras restar el desplazamiento nacional uniforme. Usa información de 2025, por eso se informa aparte.
- **r**: correlación de Pearson entre predicción y resultado.
- **Dos líneas base**:
  - *persistencia*: repetir el valor equivalente de 2021 o 2022;
  - *media nacional*: asignar a todas las comunas el promedio nacional de 2025, lo que equivale a un modelo sin información espacial.

Resultados (última ejecución; pp = puntos porcentuales; MAE ponderado por electores):

| Métrica | MAE | MAE sin swing | Swing | r | Pendiente | Persistencia (MAE / sin swing) | Media nacional |
|---|---|---|---|---|---|---|---|
| V0 · 2ª vuelta 2021 (**en muestra**) | 7,0 | 2,4 | −6,8 | 0,96 | 1,09 | — | 9,1 |
| V1 · 2ª vuelta 2025: derecha | 7,1 | **2,5** | +7,1 | 0,95 | 0,86 | 13,9 / 3,0 | 7,6 |
| V2 · 1ª vuelta 2025: izquierda | 2,5 | 2,3 | +1,0 | 0,91 | 0,99 | 17,8 / 3,5 | 5,9 |
| V2 · 1ª vuelta 2025: derecha | 19,0 | 3,4 | +19,0 | 0,86 | 1,04 | 10,2 / 2,8 | 6,3 |
| V2 · 1ª vuelta 2025: populista | 5,7 | 4,0 | −4,5 | 0,81 | 1,61 | 6,5 / 2,4 | 5,7 |
| V3 · Diputados 2025: izquierda | 7,7 | 7,4 | −1,9 | 0,74 | 0,55 | 9,8 / 6,4 | 8,6 |
| V3 · Diputados 2025: derecha | 7,4 | 7,3 | −3,1 | 0,75 | 0,58 | 8,1 / 5,8 | 8,1 |
| V3 · Diputados 2025: populista | 4,0 | 3,6 | +1,9 | 0,56 | 0,61 | 4,2 / 3,4 | 3,9 |
| V4 · Participación 2025 | 1,1 | 0,7 | +1,0 | 0,98 | 1,00 | 0,8 / 0,8 | 4,1 |

**Calibración de la escala (solo con datos en muestra).** Se probaron dos parámetros: el peso de la identificación partidaria en elecciones unipersonales (`VOTE.affinityPersonal` ∈ {1; 0,6}) y la escala del logit (`VOTE.personalScale` ∈ {1; 0,6; 0,45; 0,35}). Se eligió la combinación que minimiza el error de **V0 (2021)**: 0,6 y 0,45. Con ella, la pendiente en muestra queda en 1,09, cuando antes era 0,62 (predicciones demasiado extremas). La selección **no** usó datos de 2025. La mejora fuera de muestra en V1 (de 7,8 a 2,5 pp sin swing) es un resultado, no un objetivo de ajuste.

**Limitaciones reconocidas:**

- En **diputados** (V3), el modelo rinde peor que la persistencia (7,3 frente a 5,8 pp sin swing) y sus predicciones son demasiado dispersas (pendiente ~0,56). Las afinidades calibradas con 2021 conservan efectos de candidaturas locales que no se repiten. El factor de contracción (0,8) se fijó *a priori*. No se ajustó con 2025 para no contaminar la validación.
- La **derecha en la 1ª vuelta 2025** tiene un gran error de nivel (+19 pp), que corresponde al desplazamiento nacional de esa elección. El patrón espacial sí se reproduce (r 0,86, pendiente 1,04).
- La **participación** se predice muy bien, porque es una característica estable bajo voto obligatorio.


**Lectura:** el modelo reproduce bien el **patrón espacial** (correlaciones altas y MAE sin swing bajo). El nivel nacional de 2025, en cambio, no es predecible desde 2021: hubo un fuerte desplazamiento nacional hacia la derecha. Por eso en el juego el nivel nacional emerge de la simulación (gobierno, economía, campañas) y no de la calibración. Los bloques son una clasificación del autor (§7), y el error por bloque depende de ella.

## 6. Evolución territorial

La evolución es mensual y acotada: **ningún eje de un segmento cambia más de 3 puntos por año** por estas causas, más el reemplazo generacional (como máximo 1 punto por año).

| Causa | Efecto |
|---|---|
| Economía | El desempleo regional sobre el natural desplaza el eje económico hacia más intervención, en proporción a la sensibilidad económica |
| Gobierno y políticas | Efecto termostático: el electorado se mueve levemente en sentido contrario a las políticas completadas en el último año. La evaluación del gobierno actúa sobre el voto, no sobre la ideología |
| Crisis | Crisis sociales o de seguridad en la región aumentan el enfoque punitivo |
| Campañas | La persuasión en comunas con inversión desplaza marginalmente el eje del mensaje, más donde hay menos fidelidad |
| Generaciones | Cada año, cada tramo etario converge 1/20 hacia el tramo más joven, y el padrón joven crece 1% |
| Nuevos liderazgos y transformaciones partidarias | Actúan por la posición y la popularidad de los partidos, no moviendo al electorado |

## 7. Bloques (criterio del autor)

| Bloque | Incluye |
|---|---|
| Izquierda y centroizquierda | FA (y RD, CS y Comunes en 2021), PC, PS, PPD, PR, PL, FRVS, humanistas, ecologistas, Igualdad, PTR. Candidaturas: Boric, Provoste, Enríquez-Ominami, Artés, Jara |
| Centro | PDC, Demócratas, Amarillos. Candidatura: Mayne-Nicholls |
| Derecha | REP, UDI, RN, Evópoli, PNL, Partido Cristiano, PSC, Conservador Cristiano, PRI. Candidaturas: Kast, Sichel, Kaiser, Matthei |
| Populista / antiestablishment | PDG. Candidatura: Parisi |
| Plebiscito 2022 | Apruebo se mapea a izquierda y Rechazo a derecha **solo** para comparaciones. No es una elección partidaria |

## 8. Estrategia territorial del jugador

Para cada comuna, distrito o región, la pantalla **Territorio** muestra:

- electorado;
- apoyo estimado con intervalo de incertidumbre;
- fuerza líder y margen (competencia);
- participación esperada;
- prioridades;
- organización local;
- inversión vigente;
- costo estimado de +1 punto, que crece con la inversión.

Las estimaciones usan **solo información observable**: el último resultado comunal ajustado por la variación del promedio de encuestas. La incertidumbre crece en comunas pequeñas y con el tiempo transcurrido desde la última elección.

Hay dos acciones:

- **Invertir en campaña territorial** (1 PA, MM$): se reparte por electores, tiene rendimientos decrecientes (raíz cuadrada) y decae 20% al mes.
- **Trabajo territorial** (1 PA): fortalece la organización local con rendimiento decreciente.

La IA reparte su gasto en las 40 comunas más relevantes según el apoyo **percibido**.

**Explicaciones.** Tras cada elección se guarda una "fotografía" de los componentes de utilidad del partido del jugador en cada comuna. La pantalla muestra qué factores mejoraron o empeoraron desde entonces y con qué magnitud cualitativa: posición ideológica, imagen del partido, gobierno, problemas locales, campaña y organización. Se excluyen la identificación de fondo y los shocks aleatorios, que no son observables.

## 9. Integración

- Diputados y Senado: los votos del distrito o la circunscripción son la **suma exacta de sus comunas**.
- Alcaldes: **346 carreras con nombre real**, con bloques, incumbencia, independientes y factores locales.
- Concejales: D'Hondt por comuna con 6, 8 o 10 cupos según electores (Ley 18.695).
- Gobernadores: suma regional.
- Los resultados de la partida guardan el detalle comunal de las últimas 10 elecciones para mapas y comparaciones.
- Encuestas, IA de coaliciones y campañas usan apoyos percibidos, no la intención real.
- La economía (desempleo regional) y la opinión pública (prioridades) alimentan los pesos y la evolución.
- La Cámara inicial usa la **distribución oficial 2025 de escaños por partido y distrito** (preliminar). Los diputados son ficticios.

## 10. Regenerar los datos

```bash
bash scripts/data/download.sh
```

```bash
bash scripts/data/build.sh
```

Requiere `python3` y `openpyxl`. Ver DATA_PIPELINE.md.
