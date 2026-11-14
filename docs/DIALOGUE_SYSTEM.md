# Sistema de conversaciones políticas

> Módulo: `src/game/dialogue/`. Pantalla: **Conversaciones** (`src/screens/ConversationsScreen.tsx`, ruta `#/conversaciones`).
> Todo corre localmente, sin API externa, con números aleatorios con semilla: la misma partida y las mismas decisiones producen exactamente las mismas conversaciones.

## Arquitectura

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | Tipos serializables (`DialogueState` vive en `GameState.dialogue`) y tipos de definición (código). |
| `engine.ts` | Inicio, bloqueo, nodos, opciones, respuesta, cierre y `applyEffect` (único punto que cambia el mundo). |
| `relations.ts` | Relaciones multidimensionales direccionales, cambios graduales, descripción narrativa. |
| `memory.ts` | Memoria episódica, decaimiento, consolidación. |
| `commitments.ts` | Compromisos y su verificación semanal contra la conducta real. |
| `negotiation.ts` | Autoridad, valoración de ofertas, respuestas (acepta, contraoferta, posterga, consulta, rechaza). |
| `goals.ts` | Objetivos autónomos de cada personaje, derivados del estado. |
| `ai.ts` | Invitaciones iniciadas por la IA, consecuencias diferidas, respuestas a invitaciones. |
| `world.ts` | Objetos del mundo creados o modificados por conversaciones (carreras regionales, cargos, proyectos, coaliciones). |
| `positions.ts` | Posiciones públicas y contradicciones (integración con prensa). |
| `text.ts` | Estilos verbales y variantes de redacción deterministas. |
| `definitions/` | Conversaciones por área: `internas`, `carrera`, `colectivas`, `institucional`, `vida`. |

Flujo de una conversación:

```
contexto del mundo → definición válida (setup) → sesión → nodo → opciones visibles (when)
→ respuesta del jugador → efectos estructurados → decisión autónoma del interlocutor (decide)
→ relaciones · memoria · compromisos · consecuencias diferidas → cierre → historial
```

La interfaz solo despacha tres acciones: `conv_iniciar`, `conv_responder` y `conv_invitacion`. Una conversación breve no cuesta puntos de acción; una estratégica, decisiva o colectiva cuesta 1 PA.

## Estructura de una sesión

`DialogueSession` guarda: id, definición, semana, lugar, participantes, iniciador, motivo, formalidad, tiempo disponible (`breve`/`normal`/`amplio`), nodo actual, intercambios y su máximo, variables, transcripción, opciones elegidas, reacciones observables, resultado y la marca `fiction` (hay personas reales).

Duraciones: **breves** (1–3 intercambios, p. ej. `advertencia`), **estratégicas** (3–8, p. ej. `lista_regional`, `pedir_respaldo`) y **decisivas** (hasta 15, `socio_coalicion`). Al alcanzar el máximo la reunión se cierra con naturalidad («se acaba el tiempo»).

## Definiciones disponibles

| id | Área | Tipo | Quién inicia | Etapa |
|---|---|---|---|---|
| `lista_regional` | internas | estratégica | IA / jugador | militancia |
| `colaboracion_ascenso` | carrera | estratégica | IA (diferida) | militancia → dirigencia |
| `pedir_respaldo` | carrera | estratégica | jugador | candidatura |
| `mentoria`, `mentor_competencia` | relaciones | estratégica | IA | dirigencia |
| `reconciliacion` | relaciones | estratégica | jugador | todas |
| `cobro_compromiso` | relaciones | estratégica | IA | todas |
| `asamblea_partidaria` | internas | colectiva | jugador | militancia |
| `reunion_bancada` | parlamento | colectiva | jugador | diputado/senador |
| `negociacion_proyecto` | parlamento | estratégica | jugador | diputado/senador |
| `coordinacion_ministerial` | gobierno | estratégica | jugador | ministro/a |
| `socio_coalicion` | coaliciones | decisiva | jugador / IA | Presidencia |
| `advertencia` | vida partidaria | breve | IA | todas |

Las que exigen un cargo (`requiresOffice`) ni siquiera se ofrecen a quien no lo tiene.

## Opciones

- Hay entre 2 y 5 por decisión, escritas para la situación concreta. Nunca hay cuatro opciones fijas ni etiquetas de tono como «[Amable]».
- Las condiciones `when` ocultan las opciones que el personaje no podría decir. Ejemplos: con capital territorial ≥ 25 aparece «Tengo base propia en tu comuna»; con prestigio técnico alto, la objeción técnica a un proyecto; solo un/a parlamentario/a puede ofrecer su voto.
- Una opción ya elegida en un nodo no se repite.

## Ejemplo funcional (§19): partida real, semilla 7, Chillán (Ñuble)

En la semana 21 se abre la elección de la directiva regional del partido. Eduardo Riquelme Díaz, personaje **ficticio** y cabeza de la lista A, invita al jugador. Las transcripciones siguientes son de una ejecución de referencia. La partida concreta (quién invita, qué responde) cambia entre versiones del juego porque el mundo simulado evoluciona; las pruebas verifican las propiedades, no un texto fijo.

**Rama A: interés y aceptación.**
```
[Eduardo] Qué bueno que pudiste venir. Hemos visto cómo te has movido en Chillán y nos gustaría que fueras parte de la lista para la regional. Queremos un equipo amplio.
[Tú]      Me interesa participar. ¿Qué responsabilidades tendríamos?
[Eduardo] Necesito a alguien que coordine Chillán: reuniones con las bases, despliegue puerta a puerta y la jornada de votación. Si ganamos, quiero que sigas en el equipo regional.
[Tú]      Cuenta conmigo. Me hago cargo de Chillán.
          Quedan de acuerdo. La elección regional es en 15 semanas.
→ Integras Lista de Eduardo Riquelme Díaz. Compromiso: integrar y trabajar por la lista.
```

**Rama B: pedir responsabilidades.** Él evalúa el pedido de forma autónoma y esta vez pide pruebas antes de ofrecer un cargo:
```
[Tú]      Estoy disponible para ayudarte, pero también quiero empezar a asumir responsabilidades.
[Eduardo] Te entiendo, y está bien que lo plantees. Pero primero necesito que la gente te vea trabajando. Organiza Chillán y después vemos con calma.
```

**Rama C: crítica a la conducción.**
```
[Tú]      No creo que la actual conducción sea el camino adecuado para el partido.
[Eduardo] La conducción ha hecho lo que ha podido con lo que tiene. Criticar desde afuera es fácil.
[Tú]      No es desde afuera: es lo que se ve desde las bases. Y no voy a hacer campaña por lo mismo de siempre.
          La reunión termina con tensión.
```

**Rama D: escuchar otras propuestas.** Queda un compromiso de responder antes de la inscripción, y la lista rival (Nicolás Fernández Leiva) invita después.

### Trayectorias resultantes

Después de la conversación, las cuatro ramas siguen exactamente la misma política: aceptar toda invitación y elegir la primera opción. Este es el estado a las 90 semanas:

| Rama | Lista integrada | Ganador regional | Compromisos | Conversaciones posteriores |
|---|---|---|---|---|
| A | Riquelme (A) | **A** | cumplido | `colaboracion_ascenso` (sem. 61) |
| B | Riquelme (A) | **A** | cumplido | ninguna |
| C | Fernández (B) | **B** | cumplido con la lista B | `lista_regional` de la lista rival, `colaboracion_ascenso` con otra figura |
| D | Fernández (B) | **B** | 1 terminado, 1 cumplido | idem C |

La sumatoria de influencia del jugador cambia quién gana la directiva regional. Con eso cambian quién preside el partido en la región, la relación con cada cabeza de lista y quién lo busca después. La prueba 05 de `tests/dialogue.test.ts` lo verifica automáticamente.

## Integraciones

- **Motor semanal:** `weeklyDialogue` se llama después de `mediaWeekly` en `advanceWeek`. Hace lo siguiente: carreras regionales, verificación de compromisos, consecuencias diferidas, expiración e iniciativa de la IA, sesiones abandonadas y memoria.
- **IA y nominaciones:** los cambios de relación se reflejan en `c.relations` y en la memoria heredada (`remember`), que usan la IA y los respaldos de nominación.
- **Prensa:** ver `positions.ts`. Las entrevistas preguntan por las contradicciones registradas, y la respuesta sobre la línea partidaria queda registrada como posición.
- **Guardado:** `GameState.dialogue` es JSON puro; las partidas antiguas reciben `emptyDialogue()` al cargar.

## Antiexplotación

- Hay enfriamientos por definición y por interlocutor («Hablaron hace poco…», «Su agenda está copada»).
- Las ganancias positivas repetidas entre el mismo par rinden cada vez menos (`recentGain`), y cuesta más mover dimensiones cercanas a sus extremos.
- Hay un máximo de dos invitaciones pendientes y de una invitación nueva por semana. Además, cada personaje espera 8 semanas antes de volver a invitar.
