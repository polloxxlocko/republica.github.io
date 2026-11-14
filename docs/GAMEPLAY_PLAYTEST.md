# Pruebas de jugabilidad

`tests/gameplay.test.ts` simula carreras completas con un jugador automatizado activo (`tests/playtest.ts`). Ese jugador declara una ambición, inicia proyectos, avanza sus pasos, toma acciones concretas, responde la bandeja con criterio variable y conversa. Se usan varias semillas, regiones y partidos.

```bash
npx vitest run tests/gameplay.test.ts
```

## Métricas de referencia (ejecución real)

Columnas:
- **Únicos/año:** acontecimientos distintos decididos por año.
- **Cat. máx.:** proporción de la categoría más frecuente.
- **Relev./año:** decisiones relevantes por año.
- **Brecha media:** semanas promedio entre decisiones significativas.
- **Brecha máx.:** mayor período sin una decisión significativa.
- **Tramas:** iniciadas/resueltas.
- **Mov. NPC:** movimientos autónomos registrados (con retención acotada).
- **Proyectos:** exitosos/fallidos/abandonados.
- **1.ª cand., 1.er cargo y 1.ª derrota:** semana en que ocurrió cada hito.
- **Extr.:** acontecimientos extraordinarios más crisis.

| Semilla | Inicio | Años | Únicos/año | Cat. máx. | Relev./año | Brecha media | Brecha máx. | Tramas | Mov. NPC | Proyectos | 1.ª cand. | 1.er cargo | 1.ª derrota | Extr. |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | Concepción · PS | 3 | 39 / 41 / 31 | 20 % | 20 | 2.5 | 14 | 8/7 | 86 | 2/2/0 | 47 | 14 | 42 | 0 |
| 11 | Chillán · RN | 3 | 45 / 32 / 34 | 20 % | 21 | 2.4 | 15 | 9/7 | 77 | 2/4/0 | — | 37 | 29 | 1 |
| 19 | Valparaíso · FA | 3 | 41 / 32 / 33 | 20 % | 17 | 2.9 | 12 | 6/5 | 56 | 1/3/0 | 69 | 21 | 61 | 0 |
| 7 | Chillán · PS | 10 | 36 / 32 / 35 / 34 / 30 / 37 / 26 / 36 / 27 / 37 | 19 % | 19 | 2.8 | 12 | 25/22 | 120 | 5/6/0 | 258 | 21 | 20 | 0 |
## Qué se comprueba

| # | Criterio | Cómo se mide |
|---|---|---|
| 1 | Decisiones variadas | ≥ 20 acontecimientos distintos por año; ninguna categoría supera el 35 % |
| 2 | Oportunidades relevantes | ≥ 15 decisiones relevantes por año; brecha media ≤ 3 semanas |
| 3 | Personajes autónomos | ≥ 45 movimientos cercanos registrados en 3 años (hasta tres proactivos por semana, más los que produce la simulación) |
| 4 | Consecuencias | Al menos 8 memorias vigentes sobre el jugador (las menores se consolidan), compromisos y al menos 3 relaciones con cambios notorios |
| 5 | Historias de varios turnos | ≥ 3 tramas de varios turnos por carrera; ≥ 6 desenlaces distintos entre semillas |
| 6 | Respuesta al contexto | Secuencias distintas según región y partido; un/a independiente no recibe acontecimientos de vida partidaria |
| 7 | Las derrotas no terminan el juego | Tras la primera derrota se siguen tomando decisiones (≥ 0,4 por semana) |
| 8 | No repetición | Las acciones concretas tomadas son distintas en más del 40 % de los casos; ningún acontecimiento se repite más de 4 veces al año |
| 9 | Nada imposible | Sin actores inexistentes; sin personas reales en acontecimientos conflictivos ni como apoyos de proyectos |
| 10 | Los proyectos pueden fracasar | Hay proyectos fallidos y exitosos |
| 11 | Períodos tranquilos con interés | Brecha máxima entre 3 y 16 semanas; nada fuerza crisis extraordinarias |
| 12 | Objetivos propios | Ambición declarada, proyectos iniciados, primer cargo y primera candidatura |
| — | Primeros seis meses | ≥ 12 acontecimientos distintos, al menos 3 de vida política inicial |
| — | Persistencia | Guardar y cargar conserva tramas, iniciativas y bandeja; la simulación sigue idéntica |
| — | Diez años | ≥ 15 acontecimientos distintos cada año durante 10 años; ≥ 12 tramas; el mundo se mueve aunque el jugador no actúe |

El número total de eventos no se usa como indicador de calidad: las pruebas miden variedad, ritmo, continuidad y consecuencias.

## Hallazgos y ajustes de balance

- **Brechas largas:** el primer ajuste daba brechas de 10–13 semanas. Se reforzó el ritmo cuando lleva varias semanas sin decisiones, siempre con condiciones.
- **Acciones concretas repetidas:** se repetían demasiado. Se variaron los temas y los interlocutores, se agregaron enfriamientos por interlocutor y dos plantillas nuevas (gira y voluntarios).
- **Postura oficial ante una reforma:** salía siempre «a favor». Ahora depende de la distancia ideológica entre el partido y el proyecto.
- **Persona real en un conflicto:** el acontecimiento de nueva conducción ofrecía «ordenar una oposición» contra una persona real. Esa opción se ocultó.
