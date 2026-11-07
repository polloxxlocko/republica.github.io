# Arquitectura

## Principio

El **motor de simulación** (`src/game/`) es TypeScript puro y **no depende de React**. La interfaz (`src/app`, `src/screens`, `src/components`) solo lee el estado y despacha acciones a través de una tienda Zustand (`src/stores/gameStore.ts`).

```
estado anterior + acción + estado aleatorio  ──►  motor  ──►  estado nuevo + eventos + registro
```

- `advanceWeek(state)` y `dispatch(state, action)` (`src/game/engine/game.ts`) **clonan** la entrada (`structuredClone`). Ningún sistema muta el estado del llamador.
- Toda la aleatoriedad pasa por un PRNG con semilla (`sfc32`, `engine/rng.ts`) cuyo estado vive dentro de `GameState.rng`. Con la misma semilla y la misma secuencia de acciones se obtiene **exactamente** la misma partida; hay una prueba que lo verifica.
- `GameState` es JSON puro (sin clases, `Map` ni funciones), lo que permite guardar, exportar y migrar.

## Estructura

```
src/
  app/            App (shell, navegación por hash), selectores de UI
  components/     UI reutilizable: hemiciclo SVG, mapa esquemático, barras ideológicas, modal de decisiones, tutorial
  screens/        Pantallas (menú, creación, panel, acciones, territorio, partidos, Congreso, elecciones, noche electoral, gobierno, economía, noticias, historial, partida)
  stores/         Zustand: estado de la app, avance en trozos (no bloquea la UI), autoguardado
  persistence/    IndexedDB (db.ts) y formato de guardado versionado (saveFormat.ts)
  game/
    models/       types.ts: modelo de dominio completo
    engine/       rng, fechas, game.ts (API pública), invariants.ts
    rules/        params.ts: TODOS los coeficientes y constantes de balance
    data/         partidos, geografía, instituciones, políticas, nombres (con procedencia)
    scenarios/    chile2026.ts (constructor del escenario), index.ts (registro de escenarios)
    systems/      electorate, elections, dhondt, polls, parliament, government, economy, opinion,
                  parties, coalitions, characters, events, news, newsGen, player, util
    ai/           partyAI.ts (posicionamiento y campañas)
    territory/    data (346 comunas), model (segmentos y calibración), init, dynamics (evolución, campaña, estimaciones, explicaciones), history (carga diferida), validation
    data/territory/  comunas.json, history.json, geometry.json (generados por scripts/data)
tests/            Vitest (unidad, integración, partida larga) y balance/
e2e/              Playwright
```

## Orden de un turno (`advanceWeek`)

1. Envejecimiento anual y retiros (si cambia el año).
2. Extensión del calendario electoral; reemplazo de vacantes parlamentarias.
3. Intención de voto "real" (oculta) por región, a partir del electorado sintético.
4. Opinión pública semanal (aprobación, prioridades, popularidad de partidos).
5. Cada 4 semanas: economía mensual y reposicionamiento ideológico de los partidos (IA).
6. Vida interna de los partidos: finanzas, facciones, internas, escisiones, nuevos partidos.
7. Dinámica de coaliciones (IA) y gasto de campaña.
8. Mociones espontáneas y tramitación legislativa (comisiones, salas, veto, TC…).
9. Gobierno: ministros, políticas, presupuesto, IA presidencial e investidura (11 de marzo).
10. Eventos emergentes, crisis y efectos diferidos.
11. Encuestas.
12. Elecciones programadas para la semana.
13. Actualización del jugador (PA, influencia, logros) y noticias derivadas de cambios reales.
14. (Opcional) verificación de invariantes.

## Información imperfecta

La intención real (`nationalIntention`, `regions[].partySupport`) solo la usan el cálculo electoral y las encuestadoras. La IA de coaliciones y campañas usa `perceivedSupport()`: el último resultado regional ajustado por el promedio de encuestas. La interfaz muestra encuestas (con error), nunca la intención real. El historial de opinión registra promedios de encuestas.

## Rendimiento

Con 1.384 segmentos comunales, una semana toma unos 40 a 55 ms en un equipo convencional. El avance múltiple se ejecuta en trozos y cede el hilo cada 2 semanas (`setTimeout`), así que la interfaz sigue respondiendo y no hizo falta un Web Worker. Si la carga creciera, `advanceWeek` puede moverse a un worker sin cambios, porque es una función pura sobre datos serializables. Una partida de 24 años ocupa unos 3 MB serializada.

## Rutas

La navegación usa el *hash* (`#/congreso`), compatible con GitHub Pages sin configurar el servidor. Igual se copia `404.html` como respaldo.
