# Biblioteca de acontecimientos

La tabla se genera desde el código (`src/game/politics/library/*.ts` y `arcs.ts`): 82 definiciones en la biblioteca, más los acontecimientos propios de las etapas de las tramas. Las condiciones obligatorias, los personajes elegibles y los territorios están en la función `require` de cada definición. Las consecuencias y los acontecimientos posteriores están en cada opción.

Columnas:
- **p base:** la probabilidad semanal antes de aplicar condiciones favorecedoras, ritmo, equilibrio de categorías y novedad.
- **Enfriamiento:** las semanas antes de que la misma definición pueda reaparecer.
- **Exclusiones:** etiquetas que impiden tener dos situaciones del mismo tipo pendientes a la vez.

### A. Vida política inicial

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `a_primera_reunion` | cotidiano | 3 | 0.5 | 200 sem. | reunion_partido | escuchar, proponer, no_ir |
| `a_colaborar_campana` | relevante | 5 | 0.35 | 60 sem. | campana_ajena | sumarse, coordinar, declinar |
| `a_conflicto_militantes` | cotidiano | 3 | 0.25 | 30 sem. | conflicto_local | mediar, a, b, margen |
| `a_dirigente_interes` | relevante | 5 | 0.3 | 80 sem. | mentor | conversar, consejo, distancia |
| `a_actividad_sin_organizador` | cotidiano | 4 | 0.2 | 40 sem. | tarea_partido | asumir, aliado, nada |
| `a_responsabilidad_disponible` | relevante | 6 | 0.2 | 60 sem. | cargo_partido | postular, sugerir, no |
| `a_iniciativa_juvenil` | cotidiano | 3 | 0.15 | 100 sem. | juventud | sumarse, liderar, no |
| `a_dirigente_cuestiona` | relevante | 5 | 0.3 | 40 sem. | critica | datos, privado, contraatacar, ignorar |
| `a_interna_convocada` | relevante | 7 | 0.6 | 80 sem. | interna | directiva, desafio, neutral |
| `a_campana_afiliacion` | cotidiano | 2 | 0.15 | 70 sem. | tarea_partido | coordinar, apoyar, no |

### B. Política interna

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `b_disputa_candidatura` | relevante | 7 | 0.4 | 40 sem. | candidatura_ajena | a, b, primaria, propio |
| `b_renuncia_cargo` | cotidiano | 4 | 0.12 | 60 sem. | cargo_partido | reemplazo, reconsiderar, callar |
| `b_nueva_faccion` | relevante | 6 | 0.1 | 120 sem. | faccion | sumarse, dialogo, criticar |
| `b_prioridades` | cotidiano | 4 | 0.18 | 50 sem. | programa | defender, sintesis, acatar |
| `b_negociacion_grupos` | relevante | 5 | 0.15 | 60 sem. | faccion | mediar, a, b |
| `b_reorganizacion_directiva` | relevante | 7 | 0.6 | 60 sem. | reorganizacion | cooperar, espacio, oposicion |
| `b_aliado_cuestiona` (solo como consecuencia) | cotidiano | 5 | 0 | 40 sem. | critica | explicar, incluir, distancia |
| `b_competencia_dirigentes` | cotidiano | 4 | 0.15 | 45 sem. | conflicto_local | a, b, ninguno |
| `b_perdida_liderazgo` | relevante | 6 | 0.25 | 80 sem. | liderazgo | respaldar, cambio, silencio |
| `b_solicitud_respaldo` | relevante | 6 | 0.35 | 30 sem. | respaldo | si, cambio, no |
| `b_desacuerdo_alianza` | relevante | 6 | 0.25 | 80 sem. | alianza | favor, contra, condicionar |

### C. Relaciones personales

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `c_colaborador_ayuda` | cotidiano | 4 | 0.2 | 40 sem. | favor | ayudar, derivar, no |
| `c_aliado_reunion` | cotidiano | 4 | 0.25 | 30 sem. | reunion_aliado | comprometer, escuchar, posponer |
| `c_contactos_incompatibles` | relevante | 6 | 0.2 | 60 sem. | dilema | a, b, reunir |
| `c_recomendacion` | cotidiano | 4 | 0.15 | 50 sem. | favor | aliado, otro, nadie |
| `c_mentor_invita` | relevante | 6 | 0.25 | 80 sem. | mentor | aceptar, condiciones, rechazar |
| `c_rival_acuerdo` | relevante | 6 | 0.2 | 60 sem. | rival | aceptar, contra, rechazar |
| `c_incumple` | relevante | 7 | 0.9 | 30 sem. | incumplimiento | reclamar, exponer, pasar |
| `c_cambio_partido` | relevante | 6 | 0.12 | 120 sem. | transfuguismo | retener, respetar, criticar |
| `c_contacto_cargo` | cotidiano | 4 | 0.6 | 30 sem. | contacto_cargo | felicitar, equipo, nada |
| `c_aliado_reaparece` | cotidiano | 3 | 0.25 | 120 sem. | reencuentro | retomar, cordial |

### D. Política territorial

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `d_demanda_organizacion` | cotidiano | 4 | 0.35 | 25 sem. | demanda | gestionar, derivar, limites |
| `d_seguimiento_demanda` (solo como consecuencia) | cotidiano | 5 | 0 | 10 sem. | demanda | resultado, reconocer |
| `d_reunion_ciudadana` | cotidiano | 3 | 0.25 | 25 sem. | cabildo | hablar, escuchar, no |
| `d_proyecto_debate` | relevante | 6 | 0.15 | 80 sem. | proyecto_local | oponer, apoyar, consulta |
| `d_comunas_inversion` | relevante | 5 | 0.15 | 70 sem. | inversion | defender, repartir, silencio |
| `d_org_busca_apoyo` | cotidiano | 3 | 0.25 | 30 sem. | organizacion | ayudar, carta, no |
| `d_infraestructura` | relevante | 5 | 0.2 | 60 sem. | infraestructura | denunciar, gestionar, organizar |
| `d_autoridad_regional` | relevante | 5 | 0.25 | 60 sem. | coordinacion | sumarse, condicionar, no |
| `d_decision_nacional` | relevante | 5 | 0.2 | 50 sem. | nacional_local | defender, criticar, mediar |
| `d_reorganizacion_comunal` | relevante | 6 | 0.15 | 100 sem. | estructura | disputar, apoyar, no |
| `d_candidatura_local` | relevante | 6 | 0.3 | 60 sem. | campana_ajena | lista, colaborar, no |

### E. Campañas electorales

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `e_se_abre_candidatura` | relevante | 8 | 0.7 | 60 sem. | candidatura_propia | inscribirse, esperar, no |
| `e_primaria` | relevante | 6 | 0.6 | 100 sem. | primaria | a, b, neutral |
| `e_pide_apoyo_campana` | relevante | 6 | 0.4 | 30 sem. | campana_ajena | aceptar, parcial, no |
| `e_cambia_estrategia` | cotidiano | 4 | 0.2 | 60 sem. | estrategia | alinear, discrepar, publico |
| `e_nueva_encuesta` | cotidiano | 3 | 0.35 | 20 sem. | encuesta | aprovechar, autocritica, nada |
| `e_debate` | relevante | 6 | 0.5 | 40 sem. | debate | preparar, improvisar, no |
| `e_coalicion_lista` | relevante | 7 | 0.4 | 80 sem. | lista_pacto | defender, ceder, compensar |
| `e_critica_programatica` | relevante | 6 | 0.35 | 30 sem. | critica | datos, ajustar, contraatacar |
| `e_pierde_colaboradores` | cotidiano | 5 | 0.25 | 40 sem. | campana_propia | reunir, reemplazar, seguir |
| `e_independiente` | cotidiano | 4 | 0.2 | 60 sem. | independiente | respaldar, privado, no |

### F. Congreso y Gobierno

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `f_parlamentario_colabora` | relevante | 6 | 0.25 | 50 sem. | parlamento | si, condicion, no |
| `f_bancada_dividida` | relevante | 6 | 0.2 | 60 sem. | bancada | favor, contra, unidad |
| `f_iniciativa_legislativa` | cotidiano | 4 | 0.3 | 30 sem. | proyecto | apoyar, criticar, indicaciones, foro |
| `f_comision_especialistas` | relevante | 5 | 0.35 | 60 sem. | comision | exponer, partido, no |
| `f_ministerio_reforma` | relevante | 6 | 0.15 | 80 sem. | gobierno | aportar, critica, no |
| `f_implementacion` | cotidiano | 4 | 0.2 | 60 sem. | implementacion | ayudar, denunciar, nada |
| `f_presupuesto` | relevante | 6 | 0.5 | 45 sem. | presupuesto | pelear, apoyar, gobierno |
| `f_autoridad_coordinacion` | cotidiano | 4 | 0.25 | 40 sem. | coordinacion | si, agenda, no |
| `f_coalicion_votacion` | relevante | 7 | 0.4 | 30 sem. | votacion | alinear, negociar, contra |
| `f_reforma_tensiones` | relevante | 5 | 0.15 | 70 sem. | reforma | favor, contra, mediar |

### G. Prensa y opinión pública

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `g_medio_local` | cotidiano | 4 | 0.3 | 25 sem. | entrevista | postura, cauta, no |
| `g_reportaje` | relevante | 6 | 0.2 | 60 sem. | reportaje | antecedentes, silencio, replica |
| `g_declaracion_atencion` | relevante | 6 | 0.2 | 40 sem. | declaracion | reafirmar, matizar, retractar |
| `g_dirigente_responde` | cotidiano | 5 | 0.3 | 40 sem. | critica | debatir, ignorar |
| `g_encuesta_expectativas` | cotidiano | 4 | 0.2 | 50 sem. | encuesta | usar, humildad |
| `g_debate_nacional` | relevante | 5 | 0.2 | 60 sem. | debate_nacional | ir, columna, no |
| `g_local_regional` | cotidiano | 4 | 0.35 | 40 sem. | cobertura | difundir, bajo |
| `g_antecedentes` | cotidiano | 4 | 0.2 | 60 sem. | transparencia | todo, parcial, no |
| `g_contradiccion` | relevante | 7 | 0.5 | 30 sem. | contradiccion | explicar, negar, reconocer |
| `g_enfoques` | cotidiano | 3 | 0.2 | 40 sem. | cobertura | responder, nada |

### H. Trayectorias y oportunidades

| id | relevancia | prioridad | p base | enfriamiento | exclusiones | opciones |
|---|---|---|---|---|---|---|
| `h_candidatura_vacante` | relevante | 8 | 0.3 | 100 sem. | vacante | ofrecer, aliado, no |
| `h_busca_colaborador` | relevante | 6 | 0.2 | 80 sem. | equipo | postular, recomendar, no |
| `h_faccion_sin_lider` | relevante | 6 | 0.6 | 120 sem. | faccion | liderar, apoyar, nada |
| `h_nueva_organizacion` | relevante | 5 | 0.08 | 150 sem. | movimiento | ir, sumarse, no |
| `h_perfil_tecnico` | relevante | 7 | 0.3 | 100 sem. | gobierno | perseguir, esperar |
| `h_resultado_inesperado` | relevante | 7 | 0.8 | 60 sem. | reorganizacion | ofrecer, distancia, oposicion |
| `h_retiro_dirigente` | relevante | 6 | 0.25 | 80 sem. | retiro | sucesion, homenaje, nada |
| `h_coalicion_reorganiza` | cotidiano | 4 | 0.15 | 80 sem. | coalicion | ampliar, identidad |
| `h_derrota_espacio` | relevante | 7 | 0.6 | 100 sem. | reorganizacion | renovar, conduccion, nada |
| `h_nueva_generacion` | cotidiano | 4 | 0.15 | 100 sem. | generacion | aliar, competir, mentor |

### Acontecimientos de etapa de trama

- `arc_interna_presion` (interna)
- `arc_reorg_oferta` (interna)
- `arc_cupo_presion` (interna)
- `arc_faccion_reclamo` (interna)
- `arc_alianza_mesa` (interna)
- `arc_alcalde_pide` (territorial)
- `arc_emergente_choque` (trayectoria)
- `arc_renovacion` (trayectoria)
