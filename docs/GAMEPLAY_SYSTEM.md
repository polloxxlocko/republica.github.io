# Rediseño de jugabilidad: iniciativas, tramas, acontecimientos y rivales

> Módulo `src/game/politics/`. Pantalla **Asuntos** (`#/asuntos`), con cuatro pestañas: Bandeja, Mis iniciativas, Asuntos políticos y Movimientos. El inicio muestra «Esta semana».
> Todo es local y con semilla. El estado vive en `GameState.politics`.

## Ciclo semanal (`weeklyPolitics`)

| Pregunta | Sistema |
|---|---|
| ¿Qué ocurre en el mundo? | Tramas (`arcs.ts`), movimientos autónomos (`npc.ts`, feed) y competencias (`rivals.ts`) |
| ¿Qué oportunidades y problemas me afectan? | Acontecimientos condicionados en la bandeja (`engine.ts`, `library/`) |
| ¿Qué quiero conseguir? | Ambición (`ambitions.ts`), iniciativas (`initiatives.ts`) y acciones concretas (`contextual.ts`) |
| ¿Cómo reaccionan los demás? | Relaciones, memoria y compromisos (sistema de conversaciones), acontecimientos posteriores y respuestas de rivales |

Orden de ejecución dentro de la semana:
1. vencimientos;
2. tramas;
3. competencias;
4. iniciativas;
5. tareas;
6. personajes autónomos;
7. consecuencias diferidas (followups);
8. generación de nuevos acontecimientos;
9. acciones concretas de la semana.

## Acontecimientos condicionados

Cada definición (`EventDef`) declara:
- `require`: las condiciones obligatorias y la elección de personajes y territorio. Si no se cumplen, el acontecimiento no aparece. Nunca se genera por un contador.
- `favor`: las condiciones favorecedoras, que multiplican la probabilidad (por ejemplo, la ambición declarada o el capital territorial).
- `tier`: la relevancia (`cotidiano`, `relevante` o `extraordinario`).
- `priority`, `p`, `cooldown` y `tags`: la prioridad, la probabilidad base, el enfriamiento y las exclusiones.
- `options`: entre 2 y 5 opciones con condiciones `when`; cada opción produce consecuencias en el mundo.
- `follow`: acontecimientos posteriores. Se reevalúan al vencer: si el estado ya no los justifica, no ocurren.
- `arcOnly`: el acontecimiento solo surge como etapa de una trama o como consecuencia de otro.

Ejemplo de condiciones obligatorias en `a_interna_convocada`:
- el partido tiene una elección interna en menos de 20 semanas;
- hay un liderazgo vigente;
- existe un sector con un líder activo que puede desafiarlo.

Si falta cualquiera de las tres, la disputa no aparece.

## Ritmo y relevancia

La relevancia separa tres tipos de acontecimiento:
- **Cotidianos:** reuniones, demandas y notas de prensa.
- **Relevantes:** oportunidades, conflictos y negociaciones.
- **Extraordinarios:** los producen crisis, elecciones o cambios institucionales de otros sistemas. Nunca se fuerzan.

El director de ritmo apunta a una decisión significativa cada 1–2 semanas en fase activa. Hay fase activa cuando existe una trama viva, un proyecto en curso, una elección en menos de 26 semanas o un proceso de nominación abierto. El ritmo se ajusta así:
- La probabilidad crece con las semanas sin decisiones, pero siempre sobre situaciones que cumplen sus condiciones.
- La bandeja tiene un tope de 3 asuntos relevantes y 2 cotidianos pendientes.
- Cada semana entra como máximo un acontecimiento nuevo de cada nivel.
- La bandeja se ordena por prioridad: primero lo relevante y, dentro de eso, lo que vence antes.
- El avance de varias semanas se detiene ante un asunto relevante nuevo. Las noticias informativas no lo detienen.

## Control de repetición

- Enfriamiento por definición.
- Historial de situaciones similares: la probabilidad de cada definición se divide por (1 + 0,4 × veces vistas).
- Exclusión por etiquetas: no puede haber dos situaciones del mismo tipo pendientes a la vez.
- Equilibrio de categorías: las categorías frecuentes en las últimas 16 semanas pesan menos.
- Variantes narrativas sustantivas, no cambios de nombre:
  - el texto y las opciones dependen de la relación, el cargo y el territorio;
  - las opciones con `when` cambian el menú según el contexto.

## Iniciativas (proyectos personales)

| id | Proyecto | Ambiciones | Acciones posibles |
|---|---|---|---|
| `directiva_comunal` | Disputar la directiva comunal | cargo_partidario, presidir_partido | Conseguir respaldos · Construir la lista · Negociar con el sector rival · Presentar propuestas a la militancia · Recorrer las bases |
| `responsabilidad` | Asumir una responsabilidad partidaria | cargo_partidario | Pedir una reunión con quien preside · Hacerse cargo de una tarea concreta · Sumar respaldos en la directiva |
| `candidatura` | Conseguir una candidatura | candidatura, congreso, alcaldia | Comunicar la aspiración · Construir apoyo territorial · Negociar con dirigentes · Ordenar los requisitos legales |
| `reforma` | Impulsar una reforma | congreso, gabinete, territorio, movimiento_propio | Preparar la propuesta · Conseguir colaboradores · Buscar patrocinio · Negociar modificaciones |
| `base_territorial` | Construir base territorial | territorio, alcaldia, congreso | Diagnóstico con vecinos · Sumar dirigentes vecinales · Llevar las demandas al municipio · Operativo solidario |
| `sector_interno` | Organizar un sector para disputar el partido | presidir_partido | Recorrer regiones · Negociar con otros sectores · Inscribir la candidatura |
| `movimiento` | Construir un movimiento político | movimiento_propio | Convocar a figuras independientes · Escribir el programa · Ordenar el financiamiento |
| `gabinete` | Integrar un equipo de gobierno | gabinete | Enviar una minuta técnica al ministerio · Pedir el respaldo del partido |
Cada iniciativa registra:
- id, nombre, objetivo, responsable y participantes;
- fecha de inicio y estado: `en_curso`, `exitosa`, `fallida`, `abandonada` o `suspendida`;
- requisitos, acciones posibles, recursos usados (PA y MM$), obstáculos y riesgos;
- compromisos, resultado e historial.

**No son barras de progreso.** El avance se mide en hechos con nombre (quién apoya, quién se opone, qué obstáculo sigue en pie) y en una fuerza interna oculta:
- Repetir un paso rinde menos.
- Un proyecto sin trabajo se enfría.
- Los apoyos se retiran si la relación se deteriora.
- El desenlace es incierto: compite contra rivales con sus propias estrategias o contra las reglas reales de la simulación (la nominación del partido, el trámite del proyecto, el cupo de gobierno).
- Abandonar un proyecto molesta a quienes se sumaron.

La candidatura usa el sistema de nominaciones existente: la aspiración, los respaldos (`backers`) y la decisión del partido.

## Tramas (asuntos políticos de varios turnos)

| id | Trama | Inicio | Etapas |
|---|---|---|---|
| `interna_partido` | La elección interna del partido | por acontecimiento | Campaña interna → Votación → Reacomodo |
| `reorganizacion_interna` | La conducción ganadora reorganiza | por acontecimiento | Oferta o exclusión → Cuestionamiento de aliados |
| `competencia_candidatura` | La pelea por un cupo | por acontecimiento | Búsqueda de apoyos → Definición |
| `crisis_faccion` | Crisis de confianza en un sector | autónoma (p=0.02/sem.) | Malestar → Reclamo público → Acuerdo o ruptura |
| `negociacion_alianza` | Negociación de una alianza | por acontecimiento | Sondeos → Mesa de negociación → Acuerdo o quiebre |
| `conflicto_alcalde` | Un alcalde contra su partido | autónoma (p=0.02/sem.) | Diferencias → Ultimátum |
| `division_bancada` | La bancada dividida | por acontecimiento | Discrepancia → Votación |
| `liderazgo_emergente` | Un liderazgo emergente | autónoma (p=0.015/sem.) | Aparición → Disputa de espacios |
| `debate_reforma` | Debate interno sobre una reforma | por acontecimiento | Debate → Postura oficial |
| `crisis_coalicion` | La coalición en crisis | autónoma (p=0.03/sem.) | Tensión → Amenaza de ruptura |
| `reorganizacion_derrota` | Reorganización tras la derrota | por acontecimiento | Balance → Renovación |
Cada trama tiene:
- el conflicto central y sus participantes, con objetivos propios;
- una intensidad (`heat`) y un estado:
  - `activa`, `escalando`, `latente`, `suspendida` (sin movimiento por 16 semanas) o `resuelta`;
- etapas que pueden saltarse y que emiten acontecimientos solo si el estado lo justifica;
- condiciones de resolución, consecuencias persistentes y tramas derivadas.

### Consecuencias en cadena (ejemplo real)

`a_interna_convocada` puede desencadenar la siguiente secuencia:
1. **Te defines:** respaldas a un sector. Queda un compromiso `apoyo_interna`, que se verifica con tu conducta.
2. **Se abre la trama `interna_partido`.** A semanas de la votación, `arc_interna_presion` te tienta a cambiar de bando.
3. **La interna se resuelve** con la conducción real del partido, que es otro sistema.
4. **Si tu sector perdió,** se abre `reorganizacion_interna`. En `arc_reorg_oferta` intentas cooperar, pasas a la oposición o tomas distancia.
5. **Si cooperas,** `b_aliado_cuestiona`: un antiguo aliado reprocha tu decisión.
6. **Quedan nuevas relaciones y memorias,** y el respaldo de tu antiguo aliado puede retirarse de tus proyectos.

Ningún paso está garantizado; cada uno depende del estado de la simulación.

## Rivales y competencia

`Contest` representa una oportunidad escasa: una presidencia comunal, un cupo o un puesto. Cada semana, cada rival evalúa su fuerza frente a la tuya (influencia, reconocimiento, base y apoyos) y elige una estrategia:
- competir;
- negociar contigo;
- buscar otros apoyos;
- retirarse;
- respaldar a otra figura.

Perder no crea enemigos permanentes. La rivalidad solo crece si la relación ya era mala o si el personaje es confrontacional; de lo contrario, queda respeto.

## Personajes autónomos

`weeklyNpc` registra los movimientos que ya produce la simulación: aspiraciones, asunción de cargos y liderazgos. Además, hasta tres movimientos proactivos por semana, según los objetivos (`goalsOf`) y las posibilidades reales de cada personaje:
- construir alianzas;
- respaldar a un dirigente (fortalece su sector);
- competir por una responsabilidad;
- cambiar de postura;
- invitar al jugador a colaborar, lo que genera un acontecimiento para el jugador.

## Ambiciones

El jugador declara una ambición entre nueve: cargo partidario, candidatura, alcaldía, Congreso, territorio, gabinete, presidir el partido, movimiento propio o Presidencia.
- La ambición orienta las condiciones favorecedoras de los acontecimientos y los proyectos disponibles.
- El juego muestra obstáculos conocidos y caminos posibles, nunca requisitos ocultos ni probabilidades.
- Cambiar de ambición con frecuencia tiene un costo de credibilidad interna.

## Personas reales

- No participan en acontecimientos conflictivos: conflictos entre militantes, cuestionamientos, rivalidades, incumplimientos o cambios de partido. La prueba 9 de `tests/gameplay.test.ts` lo verifica.
- Pueden aparecer en roles institucionales neutros. En ese caso el acontecimiento se marca como ficticio (`fiction: true`) y la interfaz lo rotula.
