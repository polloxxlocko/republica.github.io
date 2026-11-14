# Diseño de juego

## Fantasía central

**REPÚBLICA: CHILE es la historia de una carrera política individual dentro de un sistema político vivo.** Empiezas a los 18 años o más como ciudadano/a sin cargo: militante de base, independiente o dirigente de una organización comunitaria. Nadie te regala nada. La Presidencia es una posibilidad excepcional, no una recompensa garantizada. Una carrera de concejal/a respetado/a, de operador/a partidario/a o de figura técnica también es una buena historia, y el legado la evalúa como tal.

Solo controlas a tu personaje. No tienes autoridad más allá de tu cargo, ni información que tu personaje no podría conocer: las fuerzas de los rivales internos se muestran como percepciones con error, y las encuestas, como estimaciones. El país sigue su curso de forma autónoma.

## Bucle principal

1. **Semana**: tienes 3 PA como base (+1 con un cargo relevante, +2 en la Presidencia, +1 con equipo de campaña). Cada acción cuesta 0 a 2 PA y a veces recursos. **Repetir la misma acción rinde menos** (fatiga que se recupera ~20% por semana), y las ganancias de reputación, arraigo y organización se **saturan** cerca del máximo. Las pérdidas no se atenúan.
2. **Avanzar**: el mundo reacciona. Surgen oportunidades, decisiones con plazo, encuestas, noticias, votaciones y crisis. «Evento» se detiene ante una oportunidad nueva, una decisión o una elección.
3. **Oportunidades** (pantalla Carrera): emergen de tu posición, tus relaciones, tu territorio, el calendario y el contexto. Cada una muestra condiciones, actores, requisitos, beneficios posibles y riesgos, y opciones para aceptar, rechazar o negociar. Si no respondes antes del plazo, se aplica la opción por omisión y la contraparte lo recuerda.
4. **Nominaciones**: manifestar interés no te hace candidato/a (ver abajo).
5. **Instituciones**: cada cargo cambia lo que haces cada semana (ver «Cada cargo cambia el juego»).

## Agenda semanal dinámica

Además de las acciones permanentes, cada semana aparece una **agenda** distinta: de 5 a 9 actividades situacionales (más con un cargo relevante, con un/a coordinador/a territorial o en campaña), sorteadas entre un catálogo de 80 (`src/game/career/agendaWeek.ts`). Tipos de actividad:

| Categoría | Ejemplos |
|---|---|
| Territorio | feria libre, puerta a puerta en una comuna vecina, cabildo, operativo social, campamento, olla común, club deportivo, recorrido rural, bomberos |
| Medios | radio regional, matinal de TV, columna, carta al director, podcast, conferencia de prensa, entrevista de fondo, foro universitario |
| Redes sociales | video corto, transmisión en vivo, desmentir una información falsa, pauta pagada, hilo explicativo, tendencia viral |
| Partido | consejo regional, taller de formación, cena de recaudación, juventud, documento programático, gira por sedes, actividad de una figura del partido |
| Sociedad civil | sindicato, gremio de pymes, organizaciones ambientales, comunidades religiosas, seminario académico, pueblos originarios, colegios profesionales, comunidad migrante, almuerzo con empresarios |
| Tu cargo | fiscalizar un contrato (concejo), inaugurar obras y cuenta pública (alcaldía), reunión con alcaldes (gobernación), proyecto de resolución, comisión en terreno y bancada (Congreso), visita a terreno (Ejecutivo) |
| Vida personal | descanso (reduce la fatiga y la presión), curso, entrenamiento de vocería, deporte, libro, voluntariado |
| Campaña | brigadas, caravana, debate de candidaturas, spot, apoderados de mesa, cierre de campaña |
| Internacional | seminario en el extranjero, delegación parlamentaria |
| Fechas especiales | verano y fiestas costumbristas, inicio del año escolar, 8 de marzo, 1 de mayo, Cuenta Pública (1 de junio), solsticio de invierno en el sur, Fiestas Patrias, Navidad, aniversario comunal |
| Contingencia | encuesta propia, acompañar la visita de una autoridad (crea un contacto), tomar posición sobre un proyecto de ley, ir a terreno en una crisis, mesa de diálogo por el malestar regional |
| Equipo | personas disponibles para sumarse a tu equipo |

Reglas del sorteo: solo entran las actividades cuyas condiciones se cumplen (cargo, región, partido, fecha, crisis, proyectos, campaña, recursos). Ninguna actividad de la semana anterior se repite. Cada categoría ya elegida pesa menos, para dar variedad. Las fechas especiales tienen más peso en su ventana. Cada actividad se puede hacer una vez y vence al terminar la semana. El resultado depende de tus atributos y tu equipo, con un riesgo indicado (bajo, medio o alto).

**Acciones permanentes que dependen de la semana**: las entrevistas exigen que un medio te invite (más probable con reconocimiento o jefe/a de prensa). Los debates requieren una invitación, la mediación requiere un conflicto local, y un acto exige lugar y permisos. La disponibilidad es determinista dentro de la semana y cambia a la siguiente.

## Equipo propio

Desde la agenda puedes sumar hasta 5 personas: jefe/a de prensa, coordinador/a territorial, asesor/a técnico/a, encargado/a de redes y encargado/a de finanzas. Cada una cobra honorarios semanales (0,8 a 1,3 MM$), aporta un efecto semanal (organización y arraigo, prestigio, presencia digital, reconocimiento o recursos) y mejora las actividades de su área. Si no puedes pagar, la persona se va. También puedes prescindir de alguien.

## Presencia digital

Es una dimensión nueva del capital político (0 a 100). Crece con las acciones en redes y con un/a encargado/a de redes, aporta reconocimiento y llega a los jóvenes. Se desgasta (−1,5% semanal) si no se alimenta, y aparece en la lectura de tu situación.

## Creación de personaje

Nombre y apellidos, género (para tratamientos), edad (18 a 70), región y comuna de residencia (las 346 comunas), educación, ocupación inicial, hasta dos rasgos personales, hasta tres intereses de política, una experiencia previa limitada (ninguna, o dirigencia estudiantil o vecinal), 12 puntos de atributos (la experiencia no se compra) y una ideología de 8 ejes. La afiliación inicial puede ser un partido (como militante de base), independiente u organización comunitaria (junta de vecinos, federación estudiantil, sindicato, agrupación ambiental, gremio de pymes, comité de vivienda o club). La organización da un rol de dirigente social y más arraigo inicial en tu comuna.

Los inicios avanzados (parlamentario/a, presidente/a de partido, Presidente/a) **ya no están en la interfaz**. Siguen en el motor solo para las pruebas automatizadas.

## Incertidumbre e información imperfecta

El futuro es incierto, pero no arbitrario. Hay tres capas separadas (`src/game/career/knowledge.ts`):

1. **Estado real** de la simulación: memorias, relaciones, puntajes de aspirantes, situaciones latentes y tiradas ocultas.
2. **Lo que sabe el personaje**: percepciones con error. El error depende de su **conocimiento político** (experiencia, redes, contactos, cargo y años en política) y de cuánto ha tratado a cada actor. Es determinista por período de seis semanas, así que la misma consulta no cambia al recargar.
3. **Lo que ve el jugador**: solo descripciones cualitativas («Tu nombre comienza a circular entre dirigentes», «La directiva aún no te considera…», «Has construido una red territorial considerable») e informes con su fuente.

La interfaz **no muestra** niveles, barras de progreso, probabilidades de candidatura, lealtades exactas, intenciones privadas ni oportunidades futuras. Sí muestra información pública (resultados por comuna, encuestas, nombramientos, estadísticas) y los propios recursos.

**Informes y rumores**: la pestaña Información de Carrera reúne lo que el personaje escucha. Cada informe tiene un tipo (información pública, contacto, información reservada, rumor o estimación propia) y una confiabilidad (alta, media o baja), que dependen de la cercanía, la integridad y el acceso de la fuente. Las fuentes pueden equivocarse o mentir si compiten contigo. Cuando los hechos ocurren, el informe se marca como **confirmado** o **desmentido**, y cada fuente acumula un historial («acertó 3 de 4 veces»). Así el jugador aprende en quién confiar.

## Oportunidades invisibles y consecuencias diferidas

El mundo genera **situaciones latentes** que existen aunque nadie te las cuente (`latent.ts`):

| Situación | Quién decide | Cómo puede llegarte |
|---|---|---|
| Una figura con cargo necesita sumar a alguien a su equipo | esa figura | oferta de asesoría (primer mentor/a) |
| Un parlamentario evalúa no repostular | el parlamentario | te apadrina como sucesor/a y te respalda en la nominación |
| Escaño vacante (art. 51 CPR) | la directiva del partido del titular | te designa en el escaño, sin elección |
| El gobierno, con baja aprobación, renueva perfiles | la Presidencia | ministerio, subsecretaría o seremía |
| Crisis de liderazgo (más frecuente en partidos pequeños o divididos) | la presidencia del partido | renuncia y elección interna abierta |
| Un sector interno busca renovar rostros | el líder del sector | te propone como su figura |

Cada situación nace con una probabilidad secreta de concretarse y una ventana temporal. Al vencer, el actor evalúa a **todos** los candidatos plausibles (personajes de IA y el jugador, si cumple los requisitos legales) según su memoria, la idoneidad y la afinidad de cada uno. Nada está predeterminado: entre medio el actor puede perder su cargo o retirarse, la relación puede cambiar y la situación puede disiparse sin que pase nada. El jugador se entera por rumores (si tiene contactos cercanos al actor), por una oferta concreta (si resulta elegido/a) o por información pública. También circulan rumores falsos sobre situaciones que no existen.

**Memoria de largo plazo**: los recuerdos de cada actor sobre el jugador no se descartan por antigüedad frente a otros (se guardan hasta 12, y lo anterior queda condensado en la relación). Así, una campaña compartida a los 22 años puede pesar cuando esa persona, ya ministra a los 30, arme su equipo a los 34.

## Ascensos meteóricos, progresión gradual y estancamiento

- **Solo hay requisitos legales**: edad (CPR), residencia, militancia o firmas, inhabilidades y límites de reelección. No se exige haber sido concejal antes de alcalde ni diputado antes de senador. Las designaciones dependen de la competencia real entre perfiles (el gabinete pondera sobre todo la idoneidad técnica y la experiencia).
- **Vías excepcionales**: escaño vacante designado por el partido, sucesión apadrinada, crisis de liderazgo en un partido pequeño, reorganización de gabinete, cupo cedido o alianza favorable. Son posibles, pero no frecuentes.
- **Progresión gradual**: redes, campañas ajenas, organización social, cargos locales, prestigio técnico, competencia por candidaturas y negociaciones internas.
- **Estancamiento**: puede ocurrir aun con decisiones razonables (cupos cedidos, rivales más fuertes, cambios de liderazgo). Se ofrecen caminos de recuperación.

## Derrotas, éxito prematuro y punto de partida

- **Balance electoral** (`review.ts`): tras cada elección se registran la votación, el margen (estrecho, claro o amplio), la comparación con lo esperado para tu sector, las comunas más fuertes y más débiles (resultados públicos), la evolución de tu imagen, tus decisiones del período, el contexto nacional y el comportamiento de tus aliados. Las consecuencias dependen del contexto: una derrota estrecha o por sobre lo esperado da reconocimiento, confianza partidaria y una oportunidad de reorientar la carrera; una derrota amplia y por debajo de lo esperado erosiona la posición; toda campaña deja experiencia y arraigo.
- **Éxito prematuro**: asumir un cargo grande con poca experiencia y poco equipo genera **presión** (oculta, descrita cualitativamente). La presión trae exigencias de los aliados, escrutinio mediático y decisiones de gestión difíciles, cuyo resultado depende de los atributos, el equipo y la experiencia, no de la edad. Se disipa con el tiempo y con el ejercicio del cargo.
- **Punto de partida**: en los partidos grandes compiten más figuras por cada candidatura (4 o 5 aspirantes de IA), y en los pequeños menos (1 o 2), pero los pequeños tienen menos organización territorial y más riesgo de perder la inscripción. Los independientes tienen autonomía, pero necesitan firmas o cupos.

## Agenda personal

Sin un cargo remunerado, el personaje necesita sustento. Puede elegir entre **trabajo a tiempo completo** (−1 PA, ingresos estables, algo de prestigio profesional), **media jornada** (equilibrio) o **dedicación exclusiva** (+1 PA, vive de sus ahorros). Si los ahorros se acaban, vuelve a la media jornada. El cambio de jornada tiene un enfriamiento de 8 semanas.

## Personajes con destinos propios

Las personas que conoces siguen sus propias carreras con el mismo motor: aspiran, compiten, ganan o pierden, son designadas, se retiran o cambian de partido. La pestaña Relaciones muestra «Tu red: dónde están hoy», y la sección Información avisa cuando alguien que conociste asume, deja un cargo o se retira.

## Capital político multidimensional

No hay «nivel». El capital tiene 12 dimensiones internas, y cada oportunidad o proceso pesa una combinación distinta. En la interfaz se presentan como lectura cualitativa de tu situación:

| Dimensión | Fuente principal | Dónde pesa |
|---|---|---|
| Arraigo territorial (por comuna) | trabajo social, mediación, atención de vecinos, campañas, semana distrital | nominaciones locales y distritales, firmas de independientes |
| Influencia partidaria | confianza de la directiva, relación con quien preside, cargos, liderar facción | nominaciones por directiva, elección interna |
| Respaldo de facciones | relación con los líderes de cada sector, ponderada por su peso | consultas internas |
| Reconocimiento nacional, popularidad, credibilidad, prestigio técnico | medios, debates, propuestas, gestión, leyes | elecciones grandes, designaciones, ministerios |
| Experiencia | ejercer cargos y campañas | requisitos de designaciones |
| Red de relaciones | saldo de aliados y rivales con memoria | respaldos y cobro de favores |
| Capacidad organizativa | asambleas, organizaciones, campañas; decae si no se cuida | firmas, campañas |
| Recursos legales | recaudación declarada, ingresos | campañas y firmas |
| Rechazo | errores, conflictos; vuelve lentamente a su base | resta en nominaciones |

El arraigo decae lentamente fuera de tu comuna de residencia, y el reconocimiento sin cargo se erosiona hacia un piso que depende de tu trayectoria.

## Nominaciones: propuesto ≠ nominado ≠ electo

Para cada elección, cada partido abre un **proceso de selección** por territorio unas 56 semanas antes. La preselección es 30 semanas antes y la decisión, antes del cierre de inscripción. El método puede ser decisión de la directiva, consulta interna o acuerdo de coalición, y cambia los pesos. Compiten:

- **Aspirantes de IA**: incumbentes (con ventaja), militantes ambiciosos con cargo y figuras emergentes. Cada uno tiene objetivos, relaciones y memoria.
- **Tú**, si manifiestas tu aspiración y cumples los **requisitos legales**: edad (18 para cargos locales, 21 para diputado/a y 35 para senador/a y Presidente/a), residencia en el territorio, militancia en un partido constituido o firmas como independiente (alcaldía y gobernación), sin inhabilidades por cargos de designación, límite de reelección (Ley 21.238) y un solo cargo por fecha electoral.

Durante el proceso puedes **pedir respaldo** a dirigentes. La respuesta puede ser un apoyo, un apoyo a cambio de un compromiso (que luego cobrarán) o una negativa. También puedes **retirarte**. Los estados son *aspirante → propuesto/a (preselección) → nominado/a o descartado/a*. El proceso también puede quedar **cancelado** si el pacto cede el cupo a un socio, lo que abre una oportunidad de reacción (acatar, protestar o pedir compensación). Solo con la nominación hay campaña, y solo el motor territorial decide si resultas **electo/a**.

Las designaciones (asesor/a, seremi, subsecretario/a, ministro/a) llegan como oportunidades, con requisitos de edad, experiencia, prestigio y trayectoria. Ninguna persona de 22 años recibe un ministerio.

## Compromisos y memoria

Los respaldos, mentorías y campañas generan **compromisos** con fecha de vencimiento. Los actores los **cobran** en momentos inconvenientes, y puedes cumplir, cumplir a medias o incumplir. Incumplir se recuerda como promesa rota (−35 en su memoria). Cumplir puede molestar a los rivales de esa figura. Aliados de hoy pueden ser rivales mañana: competir por un cupo, votar contra la línea o rechazar una oferta deja huella.

## Cada cargo cambia el juego

| Cargo | Acciones propias | Agenda (oportunidades del cargo) |
|---|---|---|
| Dirigente social | mediar conflictos | conflictos locales, organizaciones |
| Concejal/a | atención de vecinos, gestión local | sesiones de concejo, presupuesto municipal |
| Alcalde/sa | gestión local, vecinos | presupuesto (oct-nov), emergencias comunales |
| Gobernador/a | gestión local | inversión regional (abril) |
| Diputado/a, senador/a | mociones, **voto propio en sala**, semana distrital, fiscalización | votaciones de conciencia, comisiones investigadoras |
| Seremi, subsecretario/a, ministro/a | gestión ministerial | conflictos sectoriales, pedidos del Presidente |
| Asesor/a | — | encargos del mentor |
| Presidente/a de partido | pactos, disciplina | disputas internas |

Asumir un cargo incompatible hace **cesar** el anterior (art. 59 CPR): el escaño parlamentario se llena por el mecanismo de reemplazo.

## Estancamiento, retroceso y ascenso rápido

Perder una nominación, que el pacto ceda tu cupo, perder una elección, incumplir compromisos o renunciar son retrocesos posibles. Tras dos años sin avances, la interfaz muestra el estancamiento y caminos para reactivar la carrera: arraigo, campañas ajenas, cambio de partido, cupo independiente o cargos de entrada. Las oportunidades de visibilidad son más probables cuando la carrera está estancada. También es posible un ascenso rápido (por ejemplo, de diputada a los 25 años), pero siempre por un proceso y nunca por promoción automática.

## Biografía y legado

Cada hito queda en una **biografía** con fecha: inicio, cargos, nominaciones, elecciones, oportunidades, compromisos, votos y leyes. Se registran además los **primeros hitos**: primer partido, primera organización, primer mentor/a, primer cargo interno, primera candidatura, primera victoria, primera derrota, primer cargo público y primer cambio de partido. También quedan las alianzas, los conflictos, las leyes de tu autoría y los cargos. Todo sale de acontecimientos reales de la partida. La reputación se registra cada trimestre y se muestra como tendencia, sin escala numérica. El **legado** se describe cualitativamente en 7 dimensiones (cargos, desempeño electoral, arraigo, influencia partidaria, reconocimiento, credibilidad y obra), con un arquetipo y un veredicto. No exige llegar a la Presidencia.

## Tensiones de diseño

- **Popularidad vs. confianza del partido**: hablar con voz propia sube la popularidad y baja la confianza de la directiva.
- **Recursos vs. integridad**: la recaudación agresiva duplica los fondos y genera exposición a escándalos.
- **Ideología vs. votos**: los partidos de la IA y tú pueden moverse hacia el centro, pero las facciones lo resienten y pueden escindirse.
- **Ambición vs. ejecución**: anunciar una reforma no es implementarla. Debe pasar por formulación, Congreso, financiamiento y capacidad estatal, y puede fracasar.
- **Promesas**: los compromisos de negociación se recuerdan. Si no se cumplen, dañan la relación con ese partido y la memoria de su dirigencia.

## Condiciones de victoria

No hay una única condición de victoria ni un árbol de progresión. Eliges una aspiración personal, y la biografía y el legado registran y evalúan tu trayectoria. La carrera termina por retiro o por edad, pero la simulación siempre puede continuar.

## Dificultad

| | Fácil | Normal | Difícil | Experto |
|---|---|---|---|---|
| Habilidad estratégica de la IA | 0,45 | 0,70 | 0,88 | 1,00 |
| Ruido en encuestas | ×0,7 | ×1 | ×1,25 | ×1,5 |
| Recursos iniciales | ×1,6 | ×1 | ×0,75 | ×0,55 |
| Facilidad de negociación | +0,15 | 0 | −0,12 | −0,22 |
| Tolerancia a errores (varianza de entrevistas, etc.) | ×1,4 | ×1 | ×0,8 | ×0,6 |
| Presión de eventos negativos | ×0,7 | ×1 | ×1,2 | ×1,4 |

La dificultad **nunca** resta votos al jugador.

## Retención en partidas largas

- Renovación generacional: los personajes envejecen, se retiran y fallecen, y aparecen figuras emergentes.
- Partidos que se fusionan o pierden su inscripción legal, escisiones de facciones y nuevos partidos antiestablishment cuando cae la confianza institucional.
- Alternancia: desgaste del oficialismo, luna de miel y fatiga tras períodos consecutivos.
- Historial navegable por categoría, gráficos de aprobación y logros.

## Pendiente o mejoras futuras

- Escenarios históricos con datos verificados.
- Acusaciones constitucionales, interpelaciones y comisiones investigadoras.
- Mayor profundidad de política exterior.
- Un tutorial interactivo guiado por objetivos (hoy son tarjetas informativas en 5 pasos).
