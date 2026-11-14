# Memoria política

> `src/game/dialogue/memory.ts`, `src/game/dialogue/commitments.ts`

## Memoria episódica

Cada recuerdo (`CharacterMemory`) tiene:
- `owner` (quién recuerda) y `about` (de quién);
- participantes y semana;
- tipo: `primer_encuentro`, `apoyo_recibido`, `apoyo_rechazado`, `acuerdo`, `promesa_cumplida`, `promesa_incumplida`, `conflicto`, `colaboracion`, `disputa_electoral`, `negociacion`, `reconciliacion` o `consolidado`;
- resumen, importancia (`menor`, `relevante`, `compromiso`, `decisivo`), relevancia actual (`salience` 0..1), consecuencias, estado y referencias (sesión, compromiso, carrera).

Los recuerdos **relevantes o mayores** también se inscriben en la memoria heredada (`remember`), que alimenta a la IA y las nominaciones.

## Memoria selectiva: decaimiento y consolidación

`weeklyMemory` corre cada semana:
- La relevancia decae a un ritmo según la importancia: lo menor se olvida rápido y lo decisivo casi no se olvida.
- Los recuerdos menores por debajo de 0,2 se **consolidan** en un único recuerdo agregado por par («Contactos ocasionales»), que conserva el saldo.
- El tope global es de 900 recuerdos.

Ejemplo funcional (prueba 09): un recuerdo menor y uno decisivo, después de 120 semanas. El menor queda consolidado o con menos relevancia; el decisivo conserva más de 0,3.

## Compromisos

Un `PoliticalCommitment` tiene estos campos:
- deudor y acreedor, tipo y contenido;
- semana de creación y plazo;
- condiciones (`raceId`, `listId`, `billId`, `partyId`…);
- estado, tipo de incumplimiento, visibilidad, importancia y sesión de origen.

Los tipos son `apoyo_lista`, `apoyo_interna`, `trabajo_campana`, `voto_proyecto`, `reunion_seguimiento`, `lealtad`, `apoyo_aspiracion`, `equipo` y `acuerdo_programatico`.

**Se verifican con lo que pasa después, no con la respuesta elegida** (`verifyCommitments`, cada semana):

| Tipo | Se cumple si… | Se incumple si… |
|---|---|---|
| `apoyo_lista` | sigues en esa lista cuando se resuelve la elección | te cambias de lista (deliberado) o te retiras |
| `apoyo_interna` | llega la elección sin que respaldes a otra persona | compites o respaldas a otra persona (deliberado); dejas el partido (cambio de condiciones) |
| `trabajo_campana` | registras trabajo en su campaña | vence el plazo: deliberado, o cambio de condiciones si tenías campaña propia |
| `voto_proyecto` | votas a favor | votas en contra (deliberado); abstenerse = renegociado |
| `lealtad` | vence el plazo sin competir contra tu mentor/a | compites en el mismo proceso |
| `apoyo_aspiracion` (de un NPC) | la IA decide **en ese momento** si cumple, según su disposición | puede no cumplir, o aspirar al mismo cupo |
| `equipo` (de un NPC) | la lista gana y la cabeza decide respetar el acuerdo | «los espacios se repartieron entre los sectores» |

Estados: `vigente`, `cumplido`, `incumplido` (con `breach`: `deliberado`, `circunstancias` o `cambio_condiciones`), `renegociado`, `imposible` y `terminado`.

Cada tipo de incumplimiento tiene un peso distinto:
- **Deliberado:** confianza −25, fiabilidad −40, rivalidad +20, recuerdo decisivo, cumplimiento −8 y credibilidad −2.
- **Cambio de condiciones:** confianza −8 y fiabilidad −14.
- **Circunstancias:** apenas una marca.
- **Cumplido:** confianza +12, fiabilidad +20, cooperación +8 y reputación de cumplimiento +3.

Ejemplo funcional (prueba 10): tras aceptar la lista de Riquelme, `race_join` a la lista rival → el compromiso queda `incumplido/deliberado` y baja la reputación de cumplimiento. Sin cambiarse, 30 semanas después queda `cumplido`.

## Reputación

`dialogue.reputation.cumplimiento` (0..100) es la reputación de cumplir la palabra. Pondera cuánto valen las promesas del jugador en toda negociación. `respeto` es la reputación de seriedad. Además se usan las dimensiones existentes del personaje: credibilidad, reconocimiento, confianza partidaria, prestigio técnico y capital territorial de la comuna propia.

## Consecuencias diferidas

`dialogue.deferred` guarda operaciones que vencen en una semana futura y **se reevalúan al vencer** (`processDeferred`). Nada programado está garantizado:
- `invite_if` con condición `regional_president` (solo si efectivamente preside), `race_open` (solo si la carrera sigue abierta y no estás en una lista), `mentor_rivalry` (solo si ya compites con tu mentor/a; si no, se reprograma por hasta 5 años) o siempre;
- `decide_backing`: quien pidió tiempo para decidir su respaldo decide con la relación del momento.

Prueba 15: dos invitaciones diferidas con `race_open`. Una apunta a una carrera ya resuelta y la otra a una abierta. Solo se emite la segunda.
