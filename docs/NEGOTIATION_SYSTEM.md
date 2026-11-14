# Negociación política

> `src/game/dialogue/negotiation.ts`, `goals.ts`, definiciones `pedir_respaldo`, `negociacion_proyecto`, `socio_coalicion`.

## Autonomía de los personajes

Cada personaje tiene objetivos derivados del estado del mundo (`goalsOf`):
- `proteger_liderazgo`: preside el partido o la región;
- `ganar_interna`: hay elección de directiva próxima;
- `candidatura`: su ambición o un proceso abierto;
- `aprobar_proyecto`: es autor/a de un proyecto en trámite;
- `armar_lista`: encabeza una lista;
- `gestion`: tiene un cargo ejecutivo;
- `coalicion`: su partido está en una coalición tensa;
- `ampliar_red`: el caso por defecto.

En los nodos `decide`, el interlocutor elige su respuesta: acepta, rechaza, negocia, posterga o consulta. Para eso pesa sus objetivos, la relación, la memoria, la reputación de cumplimiento del jugador y una incertidumbre irreducible (ruido con semilla).

## Autoridad: nadie ofrece lo que no controla

`authorityFor(s, personaje, elemento)` devuelve el motivo si no puede ofrecerlo:

| Elemento | Quién puede ofrecerlo |
|---|---|
| `cupo_lista` | quien encabeza una lista abierta |
| `responsabilidad` | presidencia del partido, presidencia regional o cabeza de lista |
| `voto_proyecto`, `indicacion` | diputado/a o senador/a |
| `prioridad_territorial` | alcaldía, gobernación, parlamento, ministerio o Presidencia |
| `apoyo_interna` | solo militantes |

Pedir algo fuera de su autoridad resta 40 puntos y deja el motivo en `reasons` (prueba 12). Las opciones que ofrecen lo que el jugador no controla simplemente no aparecen.

## Evaluación

```
puntaje = Σ valor(ofrecido, según objetivos de quien recibe) × factor de promesa
        − Σ costo(pedido)
        + 0,35 · disposición(npc → jugador)
        − 4 · ronda
        + ruido N(0, 9)

factor de promesa = 0,5 + (fiabilidad + (cumplimiento − 50)) / 120   (acotado a 0,1..1,1)
```

Respuesta: puntaje > 18 **acepta**; > 4 **contraoferta**; > −8 **posterga** en la primera ronda o **consulta** en las siguientes; en otro caso **rechaza**.

Las promesas de quien no ha cumplido valen menos: el mismo ofrecimiento puede aceptarse a un jugador confiable y rechazarse a uno que traicionó un acuerdo.

## Contraofertas por objetivo

En `pedir_respaldo`, si la respuesta es contraoferta, la persona pide lo que le sirve:
- si protege su liderazgo o quiere ganar la interna: «Te puedo respaldar, pero necesito saber que en la interna vas a estar conmigo»;
- si tiene candidatura propia: trabajo en su campaña;
- en otro caso: apoyo público.

Aceptar la contraoferta crea un compromiso verificable. Rechazarla deja la negociación en una segunda ronda, con −4 al puntaje.

## Postergar y consultar

«Lo tengo que pensar» programa un `decide_backing` diferido 2 o 3 semanas después. En ese momento la persona decide con la relación de ese momento. Si entretanto el jugador incumplió con alguien cercano o la criticó, la respuesta cambia.

## Fracaso (prueba 13)

Con confianza −80, rivalidad 90 y fiabilidad −70, una oferta de apoyo público a cambio de apoyo en la interna se rechaza en más de 15 de 20 semillas. Las negociaciones pueden fracasar y fracasan.

## Ejemplo: socio de coalición (Presidencia, decisiva, hasta 15 intercambios)

Cuando la cohesión de la coalición baja de 45, la directiva del socio con peor relación pide audiencia. Hay varias rondas en que se ofrecen prioridades legislativas, cargos o compromisos programáticos, y el partido evalúa cada una. Los resultados posibles son:
- `acuerdo`: cohesión +, relación de partidos +;
- `acuerdo_lealtad`: más un compromiso de lealtad;
- `tregua`: plazo de evaluación;
- `salida`: `coalition_exit` saca efectivamente al partido de la coalición, con noticia, relaciones −20 y cohesión −10.
