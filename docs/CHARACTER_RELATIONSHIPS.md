# Relaciones entre personajes

> `src/game/dialogue/relations.ts`

## Modelo

Una relación es **direccional**: `rel(A, B)` es lo que A piensa de B y no tiene por qué coincidir con `rel(B, A)`. Se guarda por la clave `A>B` en `GameState.dialogue.rel`.

| Dimensión | Rango | Significado |
|---|---|---|
| `trust` | −100..100 | confianza general |
| `respect` | −100..100 | respeto por su capacidad política |
| `cooperation` | −100..100 | historial de trabajo conjunto |
| `rivalry` | 0..100 | rivalidad |
| `reliability` | −100..100 | confianza en que cumple acuerdos |
| `personal` | −100..100 | afinidad personal simulada |
| `willingness` | −100..100 | disposición a negociar |
| `familiarity` | 0..100 | conocimiento mutuo |
| `dependence` | 0..100 | cuánto depende A de B |

Las dimensiones **derivadas** se calculan en cada momento a partir del estado, sin almacenarse:
- afinidad ideológica, por la distancia entre ideologías;
- competencia, por la misma ambición, el mismo partido y región y una notoriedad comparable;
- influencia relativa, por la influencia partidaria.

La primera vez que se consulta una relación se inicializa desde el sistema heredado (`memoryBalance`), así que respeta la historia previa de la partida. Las personas reales empiezan sin recuerdos inventados.

## Cambios graduales

`changeRel(s, { from, to, dims, importance })` funciona así:
1. Escala el cambio por importancia: menor 0,25 · relevante 0,6 · compromiso 0,8 · decisivo 1.
2. Aplica saturación: mover una dimensión que ya está en un extremo cuesta más.
3. Aplica rendimientos decrecientes: las ganancias positivas acumuladas en las últimas 12 semanas dividen las siguientes. Las pérdidas no se amortiguan, porque una traición pesa completa.
4. Refleja el cambio en `c.relations` (IA, nominaciones).

Ejemplo funcional (prueba 07): cuatro veces `{ trust: +10 }` de importancia relevante entre el mismo par producen ganancias estrictamente decrecientes, y la confianza total queda bajo 30.

```ts
const gains = [0, 1, 2, 3].map(() => changeRel(g, { type: 'rel', from: npc, to: me, dims: { trust: 10 }, importance: 'relevante' }));
// gains[0] > gains[1] > gains[2] > gains[3]
```

La familiaridad crece al conversar en ambas direcciones, con saturación: +20 % de lo que falta en reuniones de tres o más intercambios y +12 % en las breves.

## Disposición

`disposition(s, A, B)` resume en un índice si A está dispuesto/a a cooperar con B. La IA lo usa en invitaciones, cumplimiento de promesas, respaldos y negociaciones:

```
0,3·confianza + 0,2·respeto + 0,15·cooperación + 0,1·afinidad personal + 0,15·fiabilidad
+ 0,1·disposición − 0,35·rivalidad + 0,12·afinidad ideológica − 0,12·competencia
```

## Lo que ve el jugador (sin números)

`describe(s, A, jugador)` devuelve frases como:
- «Te conoce poco» / «Te conoce bien»
- «Empieza a confiar en ti» / «Te tiene confianza» / «Te mira con reservas» / «Desconfía de ti»
- «Te respeta, aunque no hay simpatía»
- «El trato es cordial, pero no confía en tus acuerdos»
- «Cree que cumples lo que prometes» / «Recuerda que no cumpliste»
- «Hay roces entre ustedes» / «Te ve como un rival»
- «Han trabajado juntos» / «Depende de tu apoyo»

Ejemplo real (semilla 7, Ñuble): tras aceptar la lista de Riquelme y ganar la regional, él te describe con «Te conoce bien · Empieza a confiar en ti». Si en cambio lo criticaste y te fuiste a la lista rival, queda «Te mira con reservas · Hay roces entre ustedes».

## Asimetría (prueba 06)

Si el jugador critica la conducción de una cabeza de lista, la rivalidad de esa persona hacia el jugador sube, pero la del jugador hacia ella no cambia: quien recibió la crítica la recuerda.

## Reconciliación

`reconciliacion` aparece en la agenda cuando alguien desconfía (confianza < −15) o hay rivalidad alta (> 35). Puede funcionar si se reconoce el error con hechos o fracasar si la persona no cree en la disculpa. El resultado depende de la memoria y de la fiabilidad registrada.
