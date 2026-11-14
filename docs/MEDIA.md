# Pluralismo mediático, tendencias editoriales y cobertura política

> **Toda cobertura que el juego atribuye a medios reales es ficticia.** La interfaz lo indica en cada vista:
> «Cobertura simulada por REPÚBLICA: CHILE. Los titulares y entrevistas son ficticios y no corresponden a publicaciones reales de los medios mencionados».
>
> - No se usan logotipos ni diseños de los medios.
> - Los periodistas son personajes con nombres generados al azar.
> - No se atribuyen a organizaciones ni a personas reales delitos, coordinación ilícita ni noticias falsas.

## Módulos (`src/game/media/`)

| Archivo | Función |
|---|---|
| `registry.ts` | Perfiles documentados de medios reales, estudios fuente y consultas fechadas (`perceptionAt`, `credibilityAt`, `consumptionAt`). |
| `coverage.ts` | Hechos (`MediaEvent`), decisión de cobertura, encuadre, profundidad, tono y difusión gradual. |
| `social.ts` | Circulación digital: compartidos, sentimiento y comentarios de usuarios **sintéticos**. |
| `journalists.ts` | Periodistas ficticios, invitaciones, entrevistas con repreguntas y memoria de interacciones. |
| `effects.ts` | Efectos sobre la carrera: reconocimiento, evaluación, credibilidad y reacciones de dirigentes. |
| `evolution.ts` | Cambios anuales como **historia alternativa del juego**: audiencias simuladas, tendencia de redes, medios ficticios que surgen y cierran. |
| `src/screens/MediaScreen.tsx` | Quiosco, archivo de noticias, comparador de coberturas, entrevistas, perfiles de medios y apariciones del jugador. |

**Conexión con el resto del juego:** todos los sistemas siguen publicando con `addNews(...)`. Cada llamada crea un **hecho**; el medio que lo publica primero queda en `s.news`, y los demás medios lo cubren de forma autónoma en la pasada semanal (`mediaWeekly`).

Si quien llama no indica territorio ni protagonistas, se infieren:
- Se detectan en el texto el jugador, el Presidente, los partidos y las regiones.
- La actividad del jugador es noticia **local** mientras su conocimiento sea bajo: comunal bajo 22 de reconocimiento y regional bajo 50. Esa noticia puede escalar después.

## Fuentes de calibración

| Estudio | Datos usados | Referencia |
|---|---|---|
| Informe 2026: Consumo de Noticias y Evaluación del Periodismo en Chile | Encuesta online del 5 de marzo al 24 de abril de 2026 (n = 9.797), más 300 presenciales a menores de 29 años. Datos: percepción izquierda/centro/derecha (Gráfico 20), promedios según orientación de quien responde (Gráfico 21), consumo alineado/no alineado (Gráfico 22), consumo por tipo y por zona (Tablas 8 y 10) y credibilidad por NSE (Tabla 17). | Mellado y Cruz (2026), PUCV y Feedback · [PDF](https://storage.googleapis.com/pucvedp/web/wp-content/uploads/2026/05/Informe-Nacional-2026.pdf) · [nota PUCV](https://www.ucv.cl/pucv/informe-2026-revela-un-consumo-de-noticias-mas-incidental-fragmentado-y) · DOI 10.17605/OSF.IO/2XW8P |
| Informe Nacional 2025 (PUCV) | Encuesta online de marzo y abril de 2025 (n = 9.262). Datos: percepción izquierda/centro/derecha y credibilidad por NSE. | [PDF](https://periodismopucv.cl/app/uploads/2025/05/Informe-Nacional-2025.pdf) |
| Digital News Report 2026: Chile (Reuters Institute) | Propiedad (Copesa → La Tercera; Paramount vendió Chilevisión a Grupo Vytal; TVN, única cadena estatal); situación financiera de CNN Chile, Copesa y Cooperativa; confianza general del 34%; Meganoticias con el mayor alcance. | Fernández y Núñez-Mussa (2026) · [página](https://reutersinstitute.politics.ox.ac.uk/es/digital-news-report/2026/chile) |
| CNTV, «Pluralismo mediático» | Marco conceptual (documento de la UE). No contiene clasificaciones por medio, así que no se usó para calibrar. | [página](https://cntv.cl/estudio-repositorio/pluralismo-mediatico/) |

### Tres dimensiones que no se confunden

1. **Orientación editorial documentada** (`editorialPositions`): está vacía para todos los medios, porque no se registraron posiciones expresas verificadas. No se infiere de la audiencia ni de la propiedad.
2. **Orientación percibida por las audiencias** (`perception`): son los porcentajes PUCV, rotulados con su estudio y fecha. Los informes advierten dos cosas:
   - quienes se identifican con un sector perciben con más intensidad la orientación contraria;
   - en el Gráfico 21 de 2026, algunos promedios (El Desconcierto, El Mostrador, Ciper) no coinciden con la distribución del Gráfico 20. Se conserva el dato publicado y el modelo usa la distribución.
3. **Composición de la audiencia** (`consumption.alignedGap`): es la diferencia de consumo entre personas cuya orientación coincide con la que perciben del medio y las que no. Describe a la audiencia, no al medio.

**Perfiles fechados:** `perceptionAt(medio, fecha)` devuelve el estudio más reciente cuyo trabajo de campo cerró antes de esa fecha. Un escenario de 2025 usa el informe 2025; uno de 2026, el de 2026. Sin estudio no hay orientación asignada. Es el caso de Ex-Ante y de los medios regionales.

### Parámetros del modelo (no son mediciones)

- **Prioridades editoriales** (economía, social, seguridad, institucional, investigación, regional, inmediatez, análisis) y **capacidad semanal**: son estimaciones del autor a partir del formato y la descripción pública de cada medio. La interfaz las rotula así.
- **Alcance sin dato:** 0,25 para medios nacionales y 0,35 para regionales, dentro de su región.
- **Credibilidad sin dato:** 0,5. El informe PUCV 2026 indica que los medios regionales se evalúan mejor que otras instituciones, pero no entrega datos por medio.

## Catálogo

**Nacionales (19):** El Mercurio, La Tercera, Emol, Diario Financiero, El Mostrador, CIPER, The Clinic, El Desconcierto, El Líbero, Ex-Ante, Radio Bío Bío, Radio Cooperativa, Radio ADN, Radio Agricultura, CNN Chile, TVN / 24 Horas, Canal 13 / T13, Mega / Meganoticias y Chilevisión / CHV Noticias.

**Regionales y provinciales (12):**

| Medio | Región | Fundación |
|---|---|---|
| El Mercurio de Valparaíso | Valparaíso | 1827 |
| El Mercurio de Antofagasta | Antofagasta | 1906 |
| Diario El Sur | Biobío | 1882 (una sola fuente: por confirmar) |
| El Austral de Temuco | La Araucanía | 1916 |
| El Llanquihue | Los Lagos | 1885 |
| La Discusión | Ñuble | 1870 |
| El Rancagüino | O'Higgins | 1915 |
| Diario El Día | Coquimbo | 1944 |
| La Prensa Austral | Magallanes | Nombre desde 1941 |
| El Divisadero | Aysén | Sin fecha verificada |
| La Estrella de Iquique | Tarapacá | Sin fecha verificada |
| La Prensa de Curicó | Maule (provincia de Curicó) | 1898 |

Cada perfil enlaza sus fuentes. Si la vigencia o la fecha no se pudo verificar, figura como «por confirmar».

**Pendiente:** ampliar con medios comunales cuyo funcionamiento pueda verificarse con una fuente. No se agregó ninguno sin evidencia.

## Motor de cobertura

**Interés de cada medio por un hecho.** Para cada medio y cada hecho de la semana, o de las tres anteriores si está en difusión, se combinan:

- la importancia del hecho;
- el **ajuste territorial**:
  - un medio nacional cubre hechos regionales o comunales solo si son relevantes;
  - un medio regional cubre su región y, de forma selectiva, la agenda nacional;
  - un medio provincial cubre sus comunas;
- los protagonistas y su notoriedad;
- la actualidad;
- si hay información verificable;
- las prioridades editoriales;
- el interés probable de la audiencia (efecto **débil**, ±12%, según la orientación percibida);
- la difusión digital.

**Selección.** Cada medio elige según su **capacidad semanal** y con un componente aleatorio.

**Encuadre.** El medio elige una dimensión entre las disponibles del hecho (costos fiscales, impacto social, legalidad, economía, gestión, territorio, reacciones partidarias, transparencia, seguridad, protagonistas), ponderada por sus prioridades.

**Formato.** Breve, nota, análisis, reportaje o entrevista, según el tipo de medio.

**Titulares.** El titular **conserva el hecho**. Solo los análisis y reportajes agregan un antetítulo de enfoque, como «Lectura fiscal |». La bajada describe el enfoque y el tono; no agrega hechos.

**Tono.** Lo determina el hecho (0,65). La orientación percibida aporta un 0,15 y se suma ruido.
- El periodismo de investigación es **crítico con cualquier sector** en temas de transparencia.
- No hay ninguna regla del tipo «los medios de derecha rechazan las políticas de izquierda».

**Difusión.** Un hecho comunal puede subir a regional y luego a nacional. La probabilidad depende de su relevancia, cuánto se ha cubierto, la circulación digital, la notoriedad de los protagonistas y si hay temas de transparencia. Los medios que lo recogen lo marcan como «recogido», y el nivel alcanzado nunca baja.

## Redes sociales

Cada hecho tiene una circulación: contenidos compartidos y sentimiento de usuarios sintéticos (positivo, neutro o crítico, según el tono y la polarización), con comentarios genéricos de ejemplo.

Una difusión alta aumenta el **conocimiento**. El efecto sobre la evaluación depende del sentimiento. **No equivale a respaldo electoral.**

## Periodistas y entrevistas

**Periodistas.** Hay entre 1 y 2 por medio, con nombre generado, especialidad, años de experiencia, estilo (incisivo, cordial, técnico, confrontacional o directo), temas de interés, colegas y **memoria** de las interacciones (invitaciones, entrevistas, rechazos, invitaciones vencidas).

**Invitaciones.** Llegan con más frecuencia cuanto mayor es la notoriedad, más cargos se ocupan y más hechos recientes involucran al jugador. Al comienzo de la carrera llegan sobre todo de medios regionales.

**Entrevista.** Son 3 preguntas: área de interés, hecho reciente, partido, Gobierno o territorio. Hay cuatro tipos de respuesta:
- con datos;
- defendiendo la línea del partido;
- con una posición propia;
- evadiendo. Los periodistas incisivos o confrontacionales **repreguntan** ante una evasiva.

**Efectos diferenciados de una entrevista:**
- **Conocimiento:** según el alcance del medio.
- **Evaluación:** según el desempeño, la credibilidad del medio y la cercanía con su audiencia percibida.
- **Prestigio técnico:** sube con respuestas con datos bien evaluadas.
- **Confianza del partido:** sube con la línea partidaria y puede bajar con una posición propia distante del partido.
- **Credibilidad:** baja con las evasivas.
- **Relación con el periodista y reacciones de la dirigencia:** son probabilísticas.

Una buena entrevista en un medio nacional puede abrir conversaciones (un rumor), sin garantizar candidaturas.

## Efectos de la cobertura

Los efectos se **agregan por hecho y protagonista**: varios medios suman, pero con rendimientos decrecientes (alcance^0,6).

| Dimensión | Regla |
|---|---|
| Conocimiento | Sube con cualquier cobertura, incluso crítica, según el alcance y el formato. Es regional en medios regionales. |
| Evaluación | Sube o baja según el **tono**, la credibilidad del medio y la cercanía con su audiencia. Aparecer en un medio grande no suma popularidad por sí mismo. |
| Credibilidad | Baja con coberturas críticas de transparencia. |
| Reacciones | Una semana mediática intensa puede quedar en la memoria de la dirigencia del partido, según su personalidad. |

## Evolución e historia alternativa

Una vez al año:
- la audiencia simulada de cada medio varía, y la de los diarios tiende a bajar;
- el consumo por redes crece;
- pueden surgir o cerrar medios **ficticios** (rotulados «(ficticio)»).

Los medios reales no cierran ni cambian de dueño en la simulación. Las variaciones de su audiencia se registran como «Historia alternativa del juego… No es un dato real».

## Pruebas

`tests/media.test.ts` cubre los 12 puntos de validación:
1. datos verificables de cada medio;
2. percepciones atribuidas a estudios;
3. cobertura originada en hechos de la partida;
4. titulares que conservan el hecho;
5. autonomía frente a los partidos;
6. cobertura crítica de distintos sectores;
7. relevancia territorial;
8. difusión coherente;
9. memoria de los periodistas;
10. ausencia de popularidad automática;
11. ficción rotulada;
12. perfiles fechados según el estudio vigente.

La prueba e2e recorre el quiosco, el comparador y los perfiles.
