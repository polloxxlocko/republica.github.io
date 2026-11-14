# Guía de escritura de diálogos

## Principios

1. **Español de Chile natural, sin caricatura.** Se habla como en una sede de partido, una oficina parlamentaria o un café: «Qué bueno que pudiste venir», «Organiza Chillán y después vemos con calma», «No le demos más vueltas». Se evitan modismos forzados, garabatos y chilenismos de postal.
2. **Las opciones son cosas que el personaje dice, no tonos.** Nunca «[Amable] …» ni «(Agresivo) …». La intención se nota en lo que se dice.
3. **Las opciones nacen de la situación.** Se escriben de 2 a 5 por nodo, cada una con una consecuencia distinta. Si dos opciones llevan al mismo lugar con los mismos efectos, sobra una.
4. **Condiciones antes que comodines.** Una opción que exige conocimiento técnico, base territorial, información obtenida o un cargo va con `when`. Si no se cumple, no se muestra: no aparece una opción bloqueada para tentar al jugador.
5. **Reacciones narrativas, no números.** Se escribe «Eduardo asiente, pero no promete nada», no «+5 confianza». Los números quedan en el motor.
6. **Nadie es un dispensador.** Cada interlocutor tiene objetivos propios y puede decir que no, pedir algo a cambio o postergar.

## Estilos verbales

`styleOf(s, personaje)` asigna un estilo de forma determinista a partir de la personalidad. Es un **perfil del juego**, no una descripción de la persona real.

| Estilo | Ejemplo |
|---|---|
| formal | «Buenas tardes. Me dijeron que querías conversar conmigo. Te escucho.» |
| directo | «Tengo diez minutos. ¿Qué necesitas?» |
| conciliador | «Creo que esto nos puede unir, si lo hacemos bien.» |
| reservado | «Dime.» |
| técnico | «Los números no son concluyentes todavía.» |
| persuasivo | «Esta es la oportunidad: es lo que la gente espera de nosotros.» |
| institucional | «Corresponde una deliberación más amplia.» |

Uso en definiciones:

```ts
text: (c) => sty(c, 'i', {
  default: ['Cuéntame, ¿en qué te puedo ayudar?'],
  formal: ['Buenas tardes. Me dijeron que querías conversar conmigo. Te escucho.'],
  directo: ['Tengo diez minutos. ¿Qué necesitas?'],
}),
```

`sty` elige una variante con un hash determinista de la sesión y la clave, así que la misma partida siempre produce el mismo texto. Para el género gramatical se usa `oa(personaje)` («dispuesto/a»).

## Personas reales

- Se usan solo datos documentados: nombre, cargo y partido presentes en los datos del juego.
- No se inventan citas, escándalos, rasgos íntimos ni historia.
- Toda conversación con una persona real se marca `fiction: true`. La interfaz muestra: *«Conversación ficticia: los diálogos con personas reales son simulados por el juego y no reproducen dichos reales. Los estilos de negociación son perfiles del juego.»*
- **Nunca hay rumores sobre personas reales.** `advertencia.setup` devuelve `null` si el sujeto tiene `realId` (prueba 16).
- Los rumores sobre personajes ficticios se rotulan como «rumor no confirmado».

## Generación procedimental controlada

No se genera texto libre. Las variaciones salen de plantillas escritas a mano, combinadas con datos del estado (comuna, partido, proyecto, plazo) y estilos verbales. Ejemplo: `Necesito a alguien que coordine ${comunaOf(c)}`.

## Plantilla de un nodo

```ts
evalua_pedido: { text: '', decide: (c) => usefulness(c) > 40 && dispo(c) > 10 ? 'ofrece_cargo' : dispo(c) > -5 ? 'pide_pruebas' : 'rechaza_pedido' },
pide_pruebas: {
  text: (c) => sty(c, 'pp', { default: ['Te entiendo, y está bien que lo plantees. Pero primero necesito que la gente te vea trabajando. Organiza ' + comunaOf(c) + ' y después vemos con calma.'] }),
  options: [
    { id: 'acepta_prueba', text: 'Me parece justo. Organizo la comuna.', effects: (c) => [/* compromiso verificable */], next: 'cierre_acuerdo' },
    { id: 'insiste', text: 'Ya he trabajado. Quiero algo concreto ahora.', next: 'evalua_insistencia' },
  ],
},
```
