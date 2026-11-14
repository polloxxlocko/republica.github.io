# Sistema de encuestas

> **Todo resultado de encuesta que muestra el juego es ficticio.** Cada informe, comparación y exportación lleva el aviso:
> «Encuesta ficticia generada por REPÚBLICA: CHILE. No constituye una publicación real de la organización mencionada».
> Las organizaciones reales no participan en el juego ni avalan sus resultados. No se usan logotipos.

Las encuestas son información imperfecta que circula dentro de la simulación. Influyen en el ambiente político (partidos, gobierno, medios y candidaturas), pero **no** determinan los resultados electorales. Las elecciones se resuelven con el motor electoral, sobre el estado oculto del electorado.

## Módulos (`src/game/polling/`)

| Módulo | Archivo | Función |
|---|---|---|
| PollsterRegistry | `registry.ts` | Perfiles documentados de cada estudio, períodos metodológicos configurables, nombres alternativos ficticios y avisos. |
| SurveyMethodology | `methodology.ts` | Efectos de medición por modalidad y diseño, y parámetros ficticios por estudio (`HouseState`) con deriva AR(1). |
| SurveySamplingEngine | `sampling.ts` | Marco semanal desde el electorado sintético, selección de la muestra, ponderación por raking y preguntas. |
| SurveyScheduler | `scheduler.ts` | Calendario de cada estudio (normal, campaña, crisis) y veda legal. |
| SurveyPublisher | `publisher.ts` | Arma cada edición: preguntas pertinentes, ficha técnica, incertidumbre, titular y comparación con la edición anterior. |
| PollAggregator | `aggregator.ts` | Promedio ponderado (ver «Promedio de encuestas»). |
| SurveyHistory | `history.ts` | Evaluación posterior a cada elección. |
| PollReactionEngine | `reactions.ts` | Reacciones de los actores a la información publicada. |
| PrivatePollingSystem | `private.ts` | Estudios encargados por el jugador. |
| PollingDashboard | `src/screens/PollingDashboard.tsx` | Interfaz: informes, comparador, promedio, estudios privados, precisión y fichas. |

`index.ts` orquesta la semana. `systems/polls.ts` mantiene compatibilidad: la IA y otros sistemas leen el promedio **público** con `pollAverage`, a partir de los registros públicos (`s.polls`) derivados de cada publicación.

Datos y estado:

- **Datos reales:** los antecedentes reales de cada estudio están en el registro. Los resultados históricos reales, si se agregan, van en `src/data/polling/historicalSurveys.ts`, un archivo congelado y separado. Hoy está vacío porque no se ha incorporado ningún dato sin verificar.
- **Publicaciones simuladas:** viven en `GameState.polling.surveys`.
- **Reproducibilidad:** todo es reproducible con la semilla de la partida. No se consulta ninguna API externa durante el juego.

## Estudios documentados

Fuentes consultadas en noviembre de 2026. La periodicidad y la metodología cambian con el tiempo, por eso cada estudio tiene **períodos metodológicos** (`methods`) y una **cadencia** (`schedule`) propios.

| Estudio | Organización | Modalidad y diseño | Muestra | Periodicidad | Fuentes |
|---|---|---|---|---|---|
| Plaza Pública Cadem | Cadem | 2014 a feb. 2026: telefónica a celulares (CATI) con marco por discado aleatorio (RDD). **Desde marzo de 2026: autoadministrada online en panel propio, por cuotas de NSE** (no probabilística). | ~700 (telefónica); 1.000 teórica (online) | Semanal, resultados los domingos, desde 2014 | [Diseño metodológico 2026](https://cadem.cl/wp-content/uploads/2026/03/Diseno-Metodologico-2026-VF.pdf) · [Metodología 2022](https://cadem.cl/wp-content/uploads/2022/05/Metodologia-Plaza-2022.pdf) · [CIPER, mar. 2026](https://www.ciperchile.cl/2026/03/30/nueva-metodologia-cadem-y-el-arte-de-parecer-riguroso/) |
| Agenda Criteria | Criteria | Panel online certificado; no probabilística; muestreo aleatorio dentro del panel y cuotas. Universo: 18+ de NSE ABCD. | ~800–1.000 | Mensual en 2021; en 2026, ediciones dominicales cada 1 a 3 semanas | [Nov. 2021](https://media-front.elmostrador.cl/2021/12/Agenda-Criteria-Noviembre_2021.pdf) · [6 sep. 2026](https://media-front.elmostrador.cl/2026/09/agenda-criteria-06-de-septiembre-2026-.pdf) |
| Pulso Ciudadano | Activa Research | Panel online (OpinandoOnline); no probabilística; ponderación por género, edad, zona y NSE. | ~1.000 (más en ediciones electorales) | Quincenal (2020); semanal en períodos electorales | [Estudio especial 2024](https://chile.activasite.com/wp-content/uploads/2024/10/241111_Estudio-Especial-PULSO_CIUDADANO_5-años-Estallido-Social_1012_V2-1.pdf) · [Plebiscito 2022](https://chile.activasite.com/wp-content/uploads/2022/08/221722_PULSO_CIUDADANO_ELECTORAL_PLEBISCITO-DE-SALIDA_AGOSTO_S3_0819_V1-2.pdf) |
| Data Influye | TúInfluyes | Encuesta cerrada, autoadministrada y online a un panel propio; no probabilística; cobertura de ~170–175 comunas (≈82% de la población). | ~950–1.380 | Mensual (registros desde al menos julio de 2020) | [Julio 2026](https://media-front.elmostrador.cl/2026/07/DATA-INFLUYE-JULIO-2026.pdf) · [Mayo 2026](https://media-front.elmostrador.cl/2026/05/DATA-INFLUYE-MAYO-2026.pdf) |
| Encuesta CEP | Centro de Estudios Públicos | Probabilística, por conglomerados y trietápica (manzana, vivienda, persona); presencial cara a cara; excluye zonas de difícil acceso (Isla de Pascua, Palena, Antártica). | ~1.400–1.500 | Al menos dos olas por año (serie desde diciembre de 1986) | [Manual CEP 93](https://static.cepchile.cl/uploads/cepchile/2025/05/14-192222_s6zk_Manual-de-usuario-CEP-93.pdf) · [Manual CEP 92](https://static.cepchile.cl/uploads/cepchile/2024/10/09-155401_tsn9_Manual-del-Usuario-CEP-92.pdf) |
| Observatorio Regional (ficticio) | Organización **ficticia** del juego | Mixta, no probabilística | 500–650 | Solo en campañas parlamentarias y regionales | — |

Las temáticas de cada estudio en el registro son un resumen editorial de sus contenidos habituales. Cada edición incluye solo algunas, con probabilidades propias del estudio. El módulo electoral (rechazo, intención de participar, segunda vuelta) es común y depende del calendario.

**Nombres alternativos.** En la pestaña Encuestas, el selector «Nombres de estudios» cambia a nombres ficticios (`settings.pollNames = 'ficticios'`), por si hubiera restricciones de uso de nombres o marcas.

## Motor muestral

1. **Marco semanal.** Para cada segmento del electorado sintético se calculan:
   - la probabilidad de votar por cada partido y de votar en blanco, con la **misma utilidad** del motor electoral;
   - la participación;
   - la aprobación individual. Esta se calibra para que su promedio poblacional coincida con la aprobación del estado oculto, y varía según la cercanía ideológica con el partido del Presidente, la identificación con el oficialismo y la sensibilidad económica.

   Las candidaturas presidenciales usan la misma especificación que la elección, incluida la viabilidad.
2. **Universo y cobertura.** Se aplican las exclusiones documentadas: comunas no cubiertas por el CEP, NSE E fuera del universo de Criteria y cobertura comunal parcial de Data Influye. Esta última se aproxima con las comunas más pobladas hasta el 82%, un supuesto del modelo.
3. **Selección.** Muestreo por segmento con probabilidad proporcional a electores × **factor de inclusión de la modalidad**:
   - panel online: más jóvenes, NSE alto, zona urbana, interés político y educación;
   - teléfono: menos mayores y menos población rural;
   - presencial: cobertura amplia.

   Son supuestos genéricos sobre las modalidades, no evaluaciones de empresas.
4. **Respuesta.** Cada persona responde según su segmento, con tres ajustes:
   - indecisión, que es mayor con menos interés, lejos de la elección y sin entrevistador;
   - desplazamientos logit ficticios del estudio;
   - un **componente común** a todos los estudios.
5. **Ponderación.** Raking a los márgenes del universo en las variables declaradas por cada estudio (edad, NSE, zona, macrozona). El electorado sintético no distingue sexo. Los pesos se recortan a [0,2; 5].
6. **Por qué difieren los estudios.** La ponderación corrige la composición observable, pero no el sesgo dentro de cada celda. Por ejemplo, en un panel online la gente responde con más interés político. De ahí nacen diferencias plausibles y persistentes, sin sumar ni restar puntos arbitrarios.

### Parámetros ficticios por estudio

`HouseState` contiene los desplazamientos logit por opción y por aprobación, y un multiplicador del tratamiento de indecisos:

- se sortean con la semilla al iniciar cada período metodológico y derivan lentamente, con un AR(1) de φ = 0,94;
- se reinician cuando cambia la metodología, por ejemplo con la migración de Cadem a online;
- **no representan evaluaciones de las instituciones reales** y no se muestran al jugador.

### Incertidumbre

El tamaño efectivo se calcula como n / (efecto de diseño base × efecto de ponderación de Kish). El efecto de diseño base es 1,6 en presencial probabilística, 1,4 en telefónica y 2,0 en no probabilística.

- **Diseño probabilístico:** margen de error al 95%, con efecto de diseño.
- **Diseño no probabilístico:** se indica explícitamente que no corresponde un margen de error clásico. Solo se muestra una «variación orientativa», que no es una garantía estadística.

## Temáticas y preguntas

| Grupo | Preguntas |
|---|---|
| Gobierno | Aprobación y desaprobación presidencial; evaluación del gobierno (nota de 1 a 7). |
| Voto por partido | Intención de voto por partido. |
| Presidencial | Preferencia **espontánea** (pregunta abierta: depende del conocimiento de cada candidatura); preferencia ante una **lista**; **segunda vuelta hipotética**. |
| Módulo electoral | **Rechazo** («nunca votaría»); **intención de participar**. |
| Figuras | Conocimiento y opinión de figuras políticas. |
| Opinión pública | Confianza en instituciones; identificación izquierda, centro o derecha; percepción económica; principales problemas (respuesta múltiple); seguridad en el barrio; rumbo del país; opinión sobre el proyecto de ley más visible. |

En las preguntas de voto se muestran por separado «Ninguno / blanco / nulo» y «No sabe / no responde».

- **Segunda vuelta:** **consulta el motor de transferencia**. Cada persona elige entre los dos nombres con su propia utilidad; no se suman los apoyos de los partidos. El par se elige con el **promedio público**, no con el estado oculto, y se rotula como hipotético.
- **Inscripción y entre vueltas:** desde el cierre de inscripción (13 semanas antes, regla del juego: unos 90 días), las encuestas miden exactamente las candidaturas inscritas. Entre la primera y la segunda vuelta se mide la segunda vuelta real con los dos finalistas.
- **Base de comparación:** el comparador y el promedio usan la base de votos válidos para las preguntas de voto.
- **Escala de los parámetros de confianza:** los niveles base de confianza por institución son parámetros ficticios del modelo, no datos reales.

## Territorio

- Las encuestas nacionales **nunca** muestran estimaciones comunales.
- Las submuestras por macrozona solo se muestran con al menos 200 casos y se rotulan como de mayor incertidumbre.
- Los estudios regionales o comunales requieren un estudio con ese universo: el Observatorio Regional (ficticio) o un estudio privado.
- Las proyecciones del mapa son **modelos**, no datos encuestados.

## Calendario y veda

- **Cadencia:** cada estudio publica con su propia cadencia, que se acelera en campaña (16 semanas antes de una elección nacional). En crisis graves puede haber ediciones extraordinarias si el estudio lo contempla.
- **Noticias:** como máximo dos ediciones por semana se convierten en noticia, y solo si son relevantes (cambio de líder, variación grande, CEP, aparición del jugador).
- **Veda (Ley 18.700, art. 37):** solo se pueden divulgar encuestas de preferencias electorales hasta el decimoquinto día anterior a la elección, inclusive. Durante la veda, las ediciones se publican **sin** preguntas electorales.
  - Fuentes: texto del artículo citado en [Radio U. de Chile](https://radio.uchile.cl/?p=755686) y [CNN Chile](https://www.cnnchile.com/chilecheck/como-fue-que-se-prohibio-la-difusion-de-encuestas-dias-antes-de-las-elecciones/). Conviene contrastarlo con el texto vigente en la BCN.
  - Existe un proyecto para reducir la veda a tres días (Boletín 17.949-06, 2025). Si se aprueba, basta cambiar `VEDA_DAYS` en el escenario correspondiente.

## Promedio de encuestas

Es opcional y se muestra en la pestaña «Promedio».

1. **Base comparable:** votos válidos para las preguntas de voto y total de entrevistados para el resto.
2. **Antigüedad:** el peso se multiplica por 0,5^(edad / vida media). La vida media es de 3 semanas, o de 6 para estudios que publican cada varios meses.
3. **Tamaño efectivo:** n / efecto de diseño.
4. **Tope por estudio:** el peso total de una encuestadora no supera 1,6 veces el de su medición individual de mayor peso. Las mediciones superpuestas del mismo estudio cuentan un 30%. Así, publicar más seguido no domina el promedio.
5. **Efectos de casa:** se estiman con 26 semanas de historial, como la desviación respecto del consenso del resto ±4 semanas. Se contraen con n/(n+4) y se corrige la mitad.
6. **Intervalo:** ±1,96 × √(muestral² + dispersión entre estudios² + 1 pp²).

Es una estimación imperfecta de lo **publicado**, no del electorado oculto. La IA usa este mismo promedio.

## Consecuencias políticas

Las reacciones (`reactions.ts`) se basan en promedios públicos y tendencias de 6 a 8 semanas, no en una sola medición. Son probabilísticas y dependen de la personalidad, la cohesión y las relaciones.

- **Caída sostenida de un partido** (−2,5 pp o más): posible cuestionamiento a la directiva. La probabilidad sube con baja cohesión, rivales ambiciosos o confrontacionales y caídas grandes, y baja si quien preside el partido es conciliador. Efectos: baja la cohesión, se registra un conflicto en la memoria del rival y se informa al jugador si milita en ese partido.
- **Alza sostenida:** mejora la cohesión y el partido endurece su postura en las negociaciones.
- **Candidatura presidencial bajo 4%:** puede reconsiderar su candidatura según su personalidad (los pragmáticos más; los ideológicos menos).
- **Alta indecisión, nuevas candidaturas medidas o encuestas divergentes** (7 pp o más entre estudios): generan cobertura mediática.
- **Caída de la aprobación** (−5 pp en el promedio): los socios de la coalición pueden tomar distancia del partido del Presidente, según la personalidad de sus líderes.
- **El jugador:** es medido solo si su notoriedad lo justifica (50 nacional o 40 regional) o si es candidato o candidata presidencial. La primera aparición genera noticia y algo de conocimiento.

## Estudios privados

Se encargan con 1 PA, recursos y un plazo. Solo se puede tener uno en curso, con un intervalo mínimo de 4 semanas entre encargos.

Tipos de estudio: sondeo comunal, estudio regional, conocimiento público, evaluación de imagen, opinión sobre un programa propio y medición de candidatura (en el territorio de la candidatura).

- **Costos y plazos:** son **parámetros de juego** (`PRIVATE_SPECS`), no precios de empresas reales.
- **Método:** usan el mismo motor muestral, con su propio parámetro ficticio, error y efectos de método. No revelan el estado oculto.
- **Privacidad:** son privados y nunca llegan a `s.polls`, así que la IA no los ve.

## Historial y precisión

Tras cada elección presidencial (primera y segunda vuelta) y parlamentaria, se compara la última encuesta de cada estudio y el promedio con los resultados oficiales **ficticios** de la partida, en base de votos válidos. Se calcula:

- el error absoluto medio por opción;
- el error máximo;
- el error en el margen entre el primer y el segundo lugar.

Son métricas descriptivas de la partida, no juicios sobre la calidad real de las organizaciones.

## Pruebas

`tests/polling.test.ts` verifica:

- perfiles documentados y calendarios configurables;
- que se use el electorado sintético;
- diferencias plausibles entre estudios;
- porcentajes válidos e indecisos contabilizados;
- respaldo territorial suficiente;
- que el promedio no se deje dominar por quien publica más;
- reacciones no automáticas de la IA;
- que la información visible no lea el estado oculto;
- avisos de ficción;
- inmutabilidad de los datos históricos;
- la veda.

La prueba e2e (`e2e/ciclo.spec.ts`) recorre informe, comparador con gráfico y fichas.
