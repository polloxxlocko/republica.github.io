# Pruebas del sistema de conversaciones

Archivo: `tests/dialogue.test.ts`. Ejecutar:

```bash
npx vitest run tests/dialogue.test.ts
```

Todas usan partidas reales con semilla. El escenario base es un/a militante en Chillán (Ñuble), semilla 7: en la semana ~21 se abre la elección regional y una cabeza de lista ficticia invita al jugador.

| # | Criterio | Qué verifica |
|---|---|---|
| 01 | Iniciativa de la IA por motivos del mundo | la invitación nace de una carrera regional abierta; quien invita encabeza una lista; es ficticio |
| 02 | Estructura completa | lugar, motivo, iniciador, participantes, formalidad, máximo de intercambios, transcripción |
| 03 | Opciones contextuales | entre 2 y 5; condicionadas; sin etiquetas de tono |
| 04 | Ramas distintas | 3 ramas → 3 firmas distintas de resultado, compromisos y memorias |
| 05 | **Trayectorias divergentes** | misma política posterior durante 60 semanas: la decisión inicial cambia la lista integrada, la confianza (> 10 puntos de diferencia), la descripción narrativa y la historia de conversaciones |
| 06 | Relaciones direccionales | la crítica sube la rivalidad de quien la recibe, no la del jugador |
| 07 | Rendimientos decrecientes | ganancias repetidas estrictamente decrecientes |
| 08 | Enfriamientos | no se puede repetir la misma conversación con la misma persona |
| 09 | Memoria selectiva | lo menor decae o se consolida; lo decisivo persiste |
| 10 | Compromisos verificados por conducta | cambiarse de lista = incumplido deliberado; mantenerse = cumplido |
| 11 | Incumplimiento contextual | tener campaña propia = cambio de condiciones, sin rivalidad |
| 12 | Autoridad | no se puede pedir un voto a quien no es parlamentario/a ni ofrecer cupos sin encabezar lista |
| 13 | Rechazo de NPC | con desconfianza la negociación fracasa (> 15/20 semillas) |
| 14 | Invitaciones | preguntar el motivo, reprogramar solo una vez; rechazos repetidos dejan memoria |
| 15 | Consecuencias diferidas | se reevalúan al vencer; no están garantizadas |
| 16 | Personas reales | sin memorias previas, diálogo rotulado como ficción, sin rumores sobre ellas |
| 17 | Conversaciones colectivas | cada participante reacciona según su postura; quienes coinciden mejoran más que quienes no |
| 18 | Contenido por etapa | un militante no puede iniciar negociaciones presidenciales ni ministeriales |
| 19 | Prensa | detecta la contradicción entre lo dicho en una reunión y lo votado; un periodista incisivo pregunta por ella |
| 20 | Persistencia, determinismo, sin API | dos ejecuciones idénticas; guardar/cargar y seguir 8 semanas da el mismo estado; `fetch` nunca se llama |

## Demostración de divergencia (prueba 05)

```ts
const A = live(play(base, ['interes', 'acepta']), 60);  // acepta la lista de quien invita
const C = live(play(base, ['critica', 'defiende']), 60); // critica la conducción
// misma política posterior (acepta invitaciones, elige la primera opción)
expect(listA).toBe(head);       // A integró la lista de quien invitó
expect(listC).not.toBe(head);   // C terminó en la lista rival
expect(trust(A)).toBeGreaterThan(trust(C) + 10);
```

En la ejecución de referencia, la lista A gana en las ramas A y B y la lista B gana en las ramas C y D. El jugador inclina el resultado de la elección regional, y con eso cambian quién preside el partido en la región y quién lo busca después (ver `DIALOGUE_SYSTEM.md`).

## Regresión de rendimiento y tamaño

`tests/longrun.test.ts` y `tests/perf.test.ts` cubren toda la simulación, incluido el sistema de diálogo:
- menos de 150 ms por semana;
- archivo de guardado menor a 6 MB, gracias a la retención acotada de sesiones (80), recuerdos (900), propuestas (200), información (120), posiciones (80) e invitaciones (60).
