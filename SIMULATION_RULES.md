# Reglas de simulación

Todos los coeficientes están en `src/game/rules/params.ts`. Escalas: ideología −100..+100 por eje; popularidad, credibilidad y similares 0..100.

## 1. Ideología (8 ejes)

| Eje | −100 | +100 |
|---|---|---|
| eco | Intervención estatal | Libre mercado |
| val | Progresismo | Conservadurismo |
| seg | Enfoque preventivo | Enfoque punitivo |
| inst | Descentralización | Centralización |
| amb | Protección ambiental | Crecimiento económico |
| soc | Universalismo | Focalización |
| ord | Transformación | Continuidad institucional |
| lab | Protección laboral | Flexibilidad |

Distancia: raíz del promedio ponderado de las diferencias al cuadrado (escala /100). Los pesos dependen de las prioridades temáticas del votante (`AREA_DIM`).

## 2. Voto (logit multinomial)

> Desde la versión 0.2 el electorado es **territorial**: 346 comunas × 4 tramos etarios, calibrado con resultados oficiales. Ver TERRITORY.md para el detalle, la calibración y la validación. En elecciones unipersonales la identificación partidaria se mide con el **sector** de la candidatura (log-sum-exp de las afinidades de su coalición) con peso 0,6, y el logit se escala por 0,45. Ambos parámetros se calibraron con la segunda vuelta de 2021.

Para el segmento *s* y la opción *j* (partido o candidato):

```
U = −βI·1,6·dist(s, j) + afinidad_s,partido
    + βPop·(pop−50)/50 − βRej·(rechazo/100−0,3) + βCred·(cred−50)/50
    + βTerr·(org_región−0,4)
    + βGob·evalGob·(0,5+sensEcon)   [partidos oficialistas]  − fatiga del oficialismo
    − 0,25·βGob·evalGob·(…)          [oposición]
    + βCamp·√(gasto relativo en la región)
    + βCand·(calidad−50)/50          [elecciones personales]
    + βViab·ln(viabilidad/0,2)       [presidenciales: voto útil]
    + shock(partido, región)
P(j) = e^U / (Σ e^U + e^Ublanco)
```

- `evalGob = clamp((aprobación−42)/35)`. La fatiga crece 0,05 por año en el poder, sumando los períodos consecutivos del bloque, con tope de 0,6.
- La afinidad partidaria (log-odds) se **calibra** al crear el escenario para reproducir los apoyos base estimados por región.
- Participación: con voto obligatorio es `0,84·(0,82+0,4·interés)`. En primarias es voluntaria (`0,18`).
- Gastar más no garantiza ganar: el efecto de la campaña es la raíz cuadrada del gasto, y los rivales también gastan.

## 3. Elecciones

- **Diputados / Senado**: votos regionales → distritos (peso por magnitud × *bastión* estable partido-distrito × ruido). El arrastre del mejor candidato del partido es `e^{(q−50)/30}`. Asignación: D'Hondt entre listas (pactos), luego entre subpactos o partidos, y finalmente a los candidatos más votados del subpacto. Los subpactos se forman por agrupación ideológica (distancia < 0,24). Se considera un umbral nacional opcional (`deputyThresholdPct`, activable con la "reforma política").
- **Presidencial**: un candidato por coalición, más candidaturas díscolas (partidos con 6% o más, con una probabilidad que crece con la distancia ideológica) y un posible *outsider*. Hay 2ª vuelta 4 semanas después si nadie supera el 50% de los votos válidos. Asume el 11 de marzo.
- **Primarias**: solo coaliciones con dos o más precandidaturas. La participación es voluntaria y ponderada por el apoyo regional de la coalición.
- **Alcaldes**: 346 carreras comunales con nombre real. Cada bloque presenta a uno de sus partidos según su arraigo en la comuna; hay incumbencia, independientes y factores locales.
- **Concejales**: D'Hondt por comuna con 6, 8 o 10 cupos según electores (Ley 18.695).
- **Diputados y Senado**: los votos de cada distrito o circunscripción son la suma exacta de sus comunas.
- **Gobernadores**: más del 40% o segunda vuelta.
- **Subsistencia legal de partidos** (tras la elección de diputados): 5% en 8 regiones o en 3 contiguas, o 4 parlamentarios. Si no, el partido se fusiona con el socio de coalición más cercano que sí subsista; si no hay socio, se disuelve.

## 4. Encuestas

Valor = intención real + efecto de casa + error normal con DE `√(p(1−p)/n)·100·k` (k según dificultad), escalado por indecisos (N(18, 4)%). Margen de error informado: `1,96·√(0,25/n)·100`.

## 5. Congreso

Probabilidad de voto a favor de un parlamentario (logit):

```
x = 3,2·beneficio_ideológico·(1,2 − 0,5·flexibilidad)
  + 3,0·postura_partido·disciplina
  + 0,9·(mensaje del Ejecutivo: +0,6 oficialistas / −0,3 oposición)
  + 0,6·popularidad_del_proyecto·(1+malestar regional)
  + 1,0·apoyo personal negociado + 0,5·memoria(autor)
abstención = 0,18·e^{−1,5x²}
```

- `beneficio_ideológico` = cuánto acerca el proyecto (moderado por indicaciones) la política a la posición del parlamentario respecto del statu quo.
- `postura_partido` incluye ideología, pertenencia al gobierno, autoría y **acuerdos negociados** (×1,6).
- `disciplina = disciplina/100·(0,65+0,35·lealtad de su personalidad)·(0,55+cohesión/220)`. Controlar la presidencia del partido no garantiza sus votos.
- Quórums: simple (más sí que no entre presentes), absoluta (mayoría de miembros en ejercicio), LOC y reforma constitucional (4/7 en ejercicio, configurable). Insistencia ante veto: 2/3 en ambas cámaras.
- Duración por etapa: sin urgencia 8 semanas, simple 4, suma 2, discusión inmediata 1. Sin urgencia, una comisión puede congelar el proyecto.

**Simplificaciones documentadas**: las comisiones son una muestra de 13 diputados o 5 senadores (con prioridad a especialistas del área) y no una composición reglamentaria exacta. Las votaciones en general y en particular se unifican en una sola votación de sala. El Tribunal Constitucional se modela como un control con baja probabilidad de objeción parcial. Los vacantes los provee el partido del titular. La nueva legislatura asume al proclamarse, no el 11 de marzo; el Presidente electo sí espera hasta el 11 de marzo.

## 6. Economía (paso mensual)

```
cobre: AR(1) logarítmico en torno a 4,2 US$/lb
gap' = 0,92·gap + 0,08·0,25·4·(cobre−3,8) + 0,15·m·impulso − 0,12·(TPM−4) + 0,04·(confianza−50)/10 + shocks − prima_deuda + ε
       m = 0,8 si gap<0 (holguras), 0,3 si no
crecimiento = suavizado(potencial + 4·Δgap + shocks)
π' = 0,85π + 0,15πe + 0,18·gap·0,15 + traspaso cambiario + shocks
u' = 0,85u + 0,15(7,8 − 0,35·2·gap)
TPM* = 4 + 1,5(π−3) + 0,5·gap ; TPM' = 0,75·TPM + 0,25·TPM* (múltiplos de 25 pb)  ← Banco Central autónomo
ingresos = base + 0,18·(cobre−3,8) + 0,25·gap + ingresos de políticas
deuda' = deuda − balance/12 − deuda·(g+π)/1200
```

Subir impuestos **no** reduce el crecimiento de manera mecánica. Los efectos dependen de la confianza, de la brecha y del diseño de cada política. Hay efectos de corto plazo (shocks de 52 semanas) y de largo plazo (crecimiento potencial). El presupuesto anual sigue una regla fiscal con meta de balance estructural de −1% del PIB.

## 7. Opinión pública

Aprobación semanal con inercia de 0,9 hacia un objetivo: base de 42, luna de miel (+12 decreciente durante 16 semanas), desempleo, inflación, crecimiento, seguridad percibida, escándalos del gabinete, crisis, cohesión de la coalición, comunicación del Presidente, ánimo estructural y desgaste (−3,5 puntos por año, tope −12). La confianza institucional y el ánimo estructural se mueven lentamente, con inercia de 0,995.

## 8. Gobierno y políticas

Fases: anuncio → formulación (4 a 12 semanas según el ministro) → tramitación (si requiere ley) → aprobación → financiamiento (holgura fiscal o siguiente presupuesto) → implementación (avance según competencia ministerial, capacidad estatal, coordinación y ejecución presupuestaria; puede haber reparos de Contraloría) → evaluación (el resultado depende de la calidad del diseño, de la moderación sufrida en el Congreso y de la capacidad). Una política puede fracasar.

## 9. IA

- **Partidos**: el reposicionamiento mensual mezcla identidad (posición fundacional), búsqueda de votos (perfil de sus votantes y centro del electorado, presionada por la caída en encuestas) y el tirón de las facciones según su influencia. El gasto de campaña se asigna por escaños en juego × competitividad percibida. Las coaliciones se evalúan por la utilidad de membresía: ganancia de escaños estimada con D'Hondt sobre el apoyo **percibido**, menos el costo ideológico ponderado por la identidad, más las relaciones.
- **Personajes**: 9 personalidades (flexibilidad, lealtad, rebeldía, mediatismo, negociación) y memoria acotada (acuerdos, traiciones, promesas incumplidas) que modifica sus relaciones y votos.
- **Presidente (IA)**: elige políticas por alineamiento, saliencia ciudadana y costos; cambia ministros ante escándalos; veta mociones que lo alejan de su posición.

## 10. Eventos

Unos 25 eventos con condiciones, probabilidad semanal (los negativos se escalan por dificultad), enfriamiento, máximo de ocurrencias y efectos diferidos (reconstrucción, sumarios, promesas). Como máximo se disparan 2 eventos y 2 decisiones pendientes por semana. Si una decisión no se responde en 3 semanas, se aplica la opción por defecto.

## 11. Carrera del jugador

Código: `src/game/career/` (`capital.ts`, `nominations.ts`, `opportunities.ts`, `offices.ts`, `weekly.ts`, `summary.ts`).

- **Puntaje de aspirante** (oculto al jugador): `0,26·arraigo + w_infl·influencia + w_fac·facciones + 0,12·reconocimiento + 0,10·popularidad − 0,08·rechazo + 0,06·experiencia + 18·incumbente + Σ respaldos (3 + influencia_del_respaldo/12) + ruido N(0, 7·k_dificultad)`, con `w_infl` = 0,34 (directiva) o 0,18, y `w_fac` = 0,20 (consulta interna) o 0,10. Para la IA, el arraigo se aproxima con el reconocimiento regional.
- **Calendario del proceso**: apertura en E−56 semanas, preselección en E−30 y decisión antes del cierre de inscripción. Los cupos por partido dependen de la magnitud y del peso del partido en su pacto. Un pacto puede ceder el territorio a un socio.
- **Oportunidades**: cada tipo tiene una probabilidad semanal que depende del contexto y un enfriamiento. Hay como máximo 3 abiertas y 1 nueva por semana. Los compromisos se cobran con probabilidad semanal de 1,2% a 2%.
- **Rendimientos decrecientes**: factor de fatiga `1/(1 + 0,45·u)`, donde `u` es el uso acumulado de la misma acción, con decaimiento de 0,8 por semana. La saturación de las ganancias es `(1 − valor/105)`.
- **Decaimientos (cada 4 semanas)**: arraigo ×0,995 en la comuna de residencia y ×0,985 en el resto; organización ×0,97; reconocimiento sin cargo −4,8% del exceso sobre el piso (7 × rango del cargo); el rechazo vuelve hacia 10.
- **Voto en sala**: si el jugador no fija su voto, vota con la línea de su bancada (sí si la postura es > 0,3, no si es < −0,3, abstención en otro caso). Votar contra la línea baja la confianza partidaria, sube la credibilidad y queda en la memoria de la directiva.
- **Incompatibilidades**: al asumir un cargo de elección o designación se cesa en el anterior incompatible, y los escaños se reemplazan.

## 12. Incertidumbre, situaciones latentes y percepción

Código: `src/game/career/knowledge.ts`, `latent.ts`, `review.ts`.

- **Conocimiento político** `K = 8 + 0,3·experiencia + 0,2·redes + min(22; 1,4·contactos) + 3·rango_del_cargo + min(12; años)`, acotado a 0..100.
- **Percepción**: `valor + ruido_determinista(clave, semana/6) · dispersión · (1 − K/130)`. La actitud de un actor hacia ti se percibe con una dispersión de `45/(1 + 0,6·n)`, donde `n` es el número de recuerdos compartidos.
- **Informes**: la probabilidad semanal es `0,12 + min(0,2; 0,012·fuentes) + K/1000`. Una fuente es honesta con probabilidad `0,55 + calidad/250`, y es deshonesta si compite contigo en un proceso. Calidad = `0,4·relación + 0,4·integridad + acceso` (4 por rango de cargo, más 15 si preside el partido).
- **Situaciones latentes**: probabilidades semanales de equipo de una figura 5%; retiro parlamentario 6% (entre 60 y 116 semanas antes de la elección); reorganización de gabinete 1,2% (si la aprobación es < 42); crisis de liderazgo 0,12% a 0,6% por partido (×1,8 si el partido tiene < 8.000 militantes); renovación de facción 1,5%. Probabilidad de concretarse: 0,55 a 0,7. Evaluación del actor: `memoria·w_mem + idoneidad técnica·w_tec + reconocimiento·w_rec + influencia·w_infl + experiencia·w_exp + N(0, 8)`. En el gabinete: w_mem 0,25, w_tec 0,7 y w_exp 0,35.
- **Vacancia** (art. 51 CPR): la directiva del partido del titular evalúa a su militancia habilitada en la región (edad 21 o 35). Si elige al jugador, el escaño queda reservado hasta que responda.
- **Cesión de cupos**: la tirada y la probabilidad se fijan en la preselección, de modo que los rumores de reorganización tienen una base real verificable.
- **Presión por éxito prematuro**: al asumir un cargo, `+max(0; 9·rango − 0,5·experiencia − 0,15·organización)`. Decae `×0,985 − 0,05 − experiencia/4000` por semana. Cada cargo da experiencia: `+0,012·rango` por semana.
- **Balance electoral**: el margen es estrecho si es menor a 3 puntos, claro si es menor a 10 y amplio en otro caso. Se compara con el apoyo comunal previo del partido (dividido por el número de compañeros de lista en elecciones proporcionales). Se está por sobre lo esperado si `pct > 1,15·esperado + 1`.
- **Agenda personal**: tiempo completo da −1 PA y el ingreso de la ocupación; media jornada da 40% del ingreso; dedicación exclusiva da +1 PA y −0,35 MM$ por semana.
- **Elección interna**: el jugador recibe el peso completo de su sector solo si lo lidera; si no, compite con su influencia partidaria y el respaldo de las facciones.
- **Arraigo de la IA en nominaciones**: se infiere de su trayectoria (diputado o senador 55, alcalde 58, gobernador 50, concejal 38, dirigente territorial 28, seremi 25; un cargo pasado vale ×0,7), para que el arraigo medido del jugador compita contra raíces comparables.
- **Campaña del jugador**: el efecto sobre la calidad de la candidatura es relativo a una campaña promedio, `(intensidad − 45)/100`, acotado a [−0,4; 0,55] y multiplicado por 25. Una campaña débil resta y una intensa suma.
- **Recaudación**: `0,5 + 0,02·redes + 0,07·reconocimiento + 0,02·confianza empresarial + 2 si tiene cargo remunerado`. Quien no es conocido/a recauda poco.
- **Alcance de medios**: los debates locales dan reconocimiento regional (+3) y poco reconocimiento nacional (+0,4). Las entrevistas escalan por `(0,3 + reconocimiento/110)`.
