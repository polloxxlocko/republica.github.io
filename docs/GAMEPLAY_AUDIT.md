# Auditoría de acciones (rediseño de jugabilidad)

Esta auditoría responde a una pregunta: ¿qué acciones producían solo cambios en estadísticas, sin una situación política concreta?

## Acciones genéricas retiradas de la interfaz

| Acción anterior | Qué hacía | Por qué era genérica | Reemplazo |
|---|---|---|---|
| Reunirse con un actor (`reunion`) | Subía la relación con cualquier persona accesible | No tenía propósito, momento ni historia | `reunion`: la reunión tiene un propósito según la variante (ver más abajo) |
| Construir redes (`redes`) | Subía redes, organización y confianza | Era un botón de influencia | `terreno`: recorrer un sector concreto de una comuna con dirigentes vecinales |
| Asistir a una asamblea (`asamblea`) | Subía la confianza partidaria y daba un contacto al azar | No había tema ni postura | `asamblea_tema`: intervenir sobre una disputa, un proyecto o un problema local. Queda registrada como postura |
| Organizar un acto (`acto_politico`) | Subía popularidad y movilización | No había motivo ni público | `encuentro`: un encuentro vecinal sobre un problema real de la comuna, en 2 semanas |
| Dar una entrevista (`entrevista`) | Subía reconocimiento | El tema y la contraparte eran abstractos | `radio`: responder a un crítico concreto o fijar postura sobre un tema vigente |
| Visitar una región (`visita_region`) | Subía reconocimiento regional | Era turismo político | `gira`: acompañar a la dirigencia regional en otra comuna |
| Estudiar y prepararse (`formacion`) | Subía atributos técnicos | No tenía destinatario | `minuta`: una minuta sobre un proyecto en trámite para un parlamentario del partido |
| Recaudar (`recaudar`) | Daba dinero | No tenía para qué ni de quién | `aportes`: aportes declarados de una red concreta para un proyecto o campaña |
| Organización social, debate, mediación, propuesta | Subían arraigo, prestigio o popularidad | Eran situaciones sin actores | Ahora son acontecimientos condicionados: cabildo, demanda vecinal, proyecto en debate, entre otros |
| «Mejorar liderazgo» (implícito) | — | — | `voluntarios`: formar un equipo para un proyecto o asunto en curso |

El motor conserva las acciones antiguas, porque la IA y algunas pruebas las usan, pero el jugador ya no las ve en la pantalla Acciones.

## Variantes de una misma acción (reunión)

`meetingVariant` decide el sentido de una reunión según la historia compartida y el momento político:

| Variante | Cuándo aplica | Objetivo | Resultados posibles |
|---|---|---|---|
| `desconocido` | No se conocen (familiaridad < 12) | Presentarte y hablar de la próxima interna | Te recibe y te toma en cuenta; te deriva a su equipo; no responde |
| `mentor` | Le debes lealtad o te respeta y dependes de su apoyo | Pedir consejo y respaldo | Respaldo (compromiso verificable); «espera»; incomodidad si aspiran a lo mismo |
| `rival` | Hay rivalidad o un conflicto recordado | Bajar la tensión | Abre una conversación de reconciliación; rechaza y lo comenta |
| `deuda` | Le debes un compromiso vigente | Rendir cuentas | Reafirma la confianza; renegocia el compromiso |
| `coaspirante` | Ambos aspiran al mismo espacio | Un pacto antes de competir | Uno se retira; compiten con reglas; choque abierto |
| `nuevo_presidente` | Acaba de asumir la presidencia del partido | Ubicarte en la nueva conducción | Te incluye en un equipo; agradece sin compromiso; te excluye |
| `conocido` | Cualquier otro caso | Coordinar una tarea | Acuerdan una tarea concreta |

El resultado depende de cuatro factores:
- la disponibilidad: los cargos altos tienen la agenda llena;
- la disposición del interlocutor, que combina relación, memoria e ideología;
- sus objetivos (`goalsOf`);
- la incertidumbre de una tirada con semilla.

## Acciones institucionales que se mantienen

No son genéricas: dependen del cargo, de reglas y de procesos reales. Son las legislativas (indicaciones, comisiones, interpelación, votos), las partidarias (inscripción en la interna, sector interno, alianzas, afiliación, fundar un partido), las ejecutivas (gestión, nombramientos, cadena nacional), la jornada laboral, el equipo y la campaña.
