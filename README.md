# REPÚBLICA: CHILE

Simulador político chileno para navegador. Es la historia de **una carrera política individual** dentro de un sistema vivo. Empiezas a los 18 años o más, sin cargo, como militante de base, independiente o dirigente comunitario/a. Construyes capital político, compites por nominaciones dentro de tu partido, aprovechas o rechazas oportunidades, cumples o rompes compromisos y, si las cosas se dan, llegas a cargos de elección o de designación. La Presidencia es una posibilidad excepcional, no una meta garantizada. Partidos, parlamentarios, gobierno y electorado actúan por su cuenta.

> **Aviso.** Es una **simulación ficticia e independiente**, sin afiliación a ningún partido, institución ni medio de comunicación. **Todos los personajes son ficticios.** También son simulados la composición inicial del Congreso, el gobierno, las autoridades, los resultados de las encuestas (las encuestadoras reales solo se usan como referencia nombrada) y la cobertura de los medios (los medios reales aparecen con perfiles documentados, pero sus titulares y entrevistas son ficticios). El registro de partidos fue verificado contra SERVEL (consulta del 06-11-2026). Los atributos de los partidos (ideología, militancia, organización) son **estimaciones de balance**, no mediciones oficiales. Ver [POLITICAL_DATA.md](POLITICAL_DATA.md).

## Qué incluye (estado actual)

| Sistema | Estado |
|---|---|
| Creación de personaje desde cero (identidad, 346 comunas, educación, ocupación, rasgos, intereses, afiliación partido/independiente/organización, ideología, 4 dificultades, semilla) | ✅ |
| **Modo carrera**: capital político de 12 dimensiones, oportunidades emergentes con requisitos, beneficios, riesgos y plazos, procesos de nominación con aspirantes de IA (propuesto ≠ nominado ≠ electo), compromisos que se cobran, relaciones con memoria, agenda propia de cada cargo, voto parlamentario propio, incompatibilidades, estancamiento, biografía y legado. Ver [GAME_DESIGN.md](GAME_DESIGN.md) | ✅ |
| **Incertidumbre e información imperfecta**: percepción con error según el conocimiento político, informes y rumores con fuente y confiabilidad que se verifican con los hechos, situaciones latentes que el jugador puede no conocer nunca, consecuencias diferidas por memoria de largo plazo, vacancias (art. 51 CPR), balance retrospectivo de cada elección, presión por éxito prematuro, agenda personal (trabajo frente a política) y contactos con destinos propios. Sin niveles ni probabilidades visibles | ✅ |
| **Labor parlamentaria**: comisiones y su presidencia, jefatura de bancada, semanas legislativas y distritales, asistencia y pareos, indicaciones, sesiones especiales, interpelaciones, citaciones, oficina distrital, bancadas transversales, Ley del Lobby, declaración de intereses y registro público que pesa en la reelección. Sin solapamientos de cargos | ✅ |
| **Agenda semanal dinámica**: 80 actividades situacionales que cambian cada semana según el cargo, la región, el partido, el calendario cívico chileno, las crisis y las campañas; acciones permanentes que dependen de invitaciones o conflictos; equipo propio (prensa, territorio, asesoría técnica, redes y finanzas); presencia digital y encuestas encargadas | ✅ |
| Calendario semanal, puntos de acción, ~45 acciones con costo de oportunidad y rendimientos decrecientes | ✅ |
| **Motor territorial de 346 comunas** (SERVEL, INE Censo 2024, padrón 2023), calibrado con resultados oficiales y validado fuera de muestra (2021-22 → 2025). Ver [TERRITORY.md](TERRITORY.md) | ✅ |
| Mapa electoral comunal (geometría oficial del MOP) con capas, comparación entre elecciones, estrategia territorial y explicaciones | ✅ |
| Elecciones: presidencial con 2ª vuelta, primarias, diputados (28 distritos, D'Hondt, pactos y subpactos), Senado (renovación por mitades), alcaldes, concejales, gobernadores con 2ª vuelta | ✅ |
| **Sistema de encuestas**: Plaza Pública Cadem, Agenda Criteria, Pulso Ciudadano, Data Influye y Encuesta CEP como referencias documentadas (resultados **ficticios**), motor que entrevista al electorado sintético según modalidad y ponderación, calendarios propios, veda legal, comparador, promedio ponderado, estudios privados, reacciones de los actores y evaluación tras cada elección. Ver [docs/POLLING.md](docs/POLLING.md) | ✅ |
| **Ecosistema de medios**: 19 medios nacionales y 12 regionales reales con perfiles documentados (percepción ideológica, credibilidad y consumo según PUCV 2025–2026; propiedad según Reuters 2026), cobertura autónoma con encuadres y tonos distintos, difusión local → nacional, redes con usuarios sintéticos, periodistas ficticios con memoria y entrevistas con repreguntas. Toda cobertura es ficticia. Ver [docs/MEDIA.md](docs/MEDIA.md) | ✅ |
| Noche electoral con escrutinio progresivo | ✅ |
| Congreso: 205 escaños individuales, hemiciclo interactivo, tramitación completa (comisiones, salas, tercer trámite, comisión mixta, veto, insistencia, TC), quórums, urgencias, negociación con partidos y parlamentarios | ✅ |
| Gobierno: gabinete de 25 ministerios, cuoteo, 24 políticas con ciclo anuncio→…→evaluación, presupuesto anual (art. 67 CPR), capacidad estatal, Contraloría | ✅ |
| Economía macro mensual con Banco Central autónomo (regla de Taylor), cobre, regla fiscal, deuda, pobreza | ✅ |
| IA de partidos por utilidades (posicionamiento, campañas, coaliciones, internas, escisiones, nuevos partidos) con información imperfecta y memoria de actores | ✅ |
| Eventos emergentes (≈25) con condiciones, enfriamiento y efectos diferidos; crisis; noticias de medios ficticios | ✅ |
| Persistencia IndexedDB (múltiples partidas, autoguardado, exportar/importar JSON, versionado y migraciones) | ✅ |
| Escenarios históricos (1990, 2000, 2010, 2019, 2021) | ⏳ arquitectura lista, sin datos verificados |
| Municipales/gobernadores 2024 y Senado 2025 como datos históricos | ⏳ no disponibles como archivos descargables; alcaldes y Senado iniciales siguen simulados |

## Requisitos

- Node.js 20 o más (probado con 22) y npm.

## Instalación y ejecución

```bash
npm install
```

```bash
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173/`).

## Compilar

```bash
npm run build
```

El resultado queda en `dist/` con rutas relativas (`base: './'`), de modo que funciona en cualquier subcarpeta. Para fijar una base explícita:

```bash
VITE_BASE=/mi-repo/ npm run build
```

## Publicar en GitHub Pages

El flujo `.github/workflows/deploy.yml` compila y publica en cada push a `main`. Ver [DEPLOYMENT.md](DEPLOYMENT.md). En resumen: en *Settings → Pages* elige **Source: GitHub Actions** y haz push a `main`. El sitio queda en `https://USUARIO.github.io/NOMBRE-REPOSITORIO/`.

## Guardar partidas

- **Autoguardado** cada 4 semanas de juego, en IndexedDB del navegador.
- **Guardado manual** desde la pantalla *Partida*. Se admiten múltiples partidas.
- **Exportar/Importar JSON** desde *Partida* o desde el menú principal. Los archivos llevan versión de esquema, se migran automáticamente, se validan y se reparan cuando faltan campos opcionales.
- Los guardados viven en el navegador. Si borras los datos del sitio, se pierden, así que exporta las partidas importantes.

## Pruebas

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run balance
```

Ver [TESTING.md](TESTING.md).

## Actualizar datos políticos

Los datos de referencia están en `src/game/data/`. Cada conjunto declara fuente, fecha de corte, confianza, naturaleza (documentado/estimado/simulado/aportado por el usuario) y versión. Para actualizar:

1. Edita `src/game/data/parties.ts` (partidos) o `geography.ts` (territorio) con la nueva información oficial.
2. Actualiza el bloque `Provenance` correspondiente (fuente, corte, fecha de consulta).
3. Si cambias la forma del estado, incrementa `SCHEMA_VERSION` en `src/game/scenarios/chile2026.ts` y agrega una migración en `src/persistence/saveFormat.ts`.
4. Ejecuta `npm test` y `npm run balance`.

## Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md): estructura del código y flujo del motor.
- [GAME_DESIGN.md](GAME_DESIGN.md): diseño de juego, progresión y dificultad.
- [POLITICAL_DATA.md](POLITICAL_DATA.md): fuentes, verificación y datos simulados.
- [TERRITORY.md](TERRITORY.md): motor electoral territorial, calibración y validación.
- [DATA_PIPELINE.md](DATA_PIPELINE.md): cómo regenerar los datos oficiales.
- [SIMULATION_RULES.md](SIMULATION_RULES.md): fórmulas, parámetros y simplificaciones institucionales.
- [DEPLOYMENT.md](DEPLOYMENT.md): despliegue en GitHub Pages.
- [TESTING.md](TESTING.md): pruebas y balance.
- [docs/MEDIA.md](docs/MEDIA.md): ecosistema de medios, fuentes de calibración y reglas de cobertura.
- [docs/POLLING.md](docs/POLLING.md): sistema de encuestas (encuestadoras reales como referencia, resultados ficticios, motor muestral, promedio, veda y evaluación).
- [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md), [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md), [docs/UI_SCREEN_SPECIFICATIONS.md](docs/UI_SCREEN_SPECIFICATIONS.md), [docs/PHOTO_SOURCES.md](docs/PHOTO_SOURCES.md), [docs/ASSET_LICENSES.md](docs/ASSET_LICENSES.md), [docs/CHARACTER_ART_STYLE.md](docs/CHARACTER_ART_STYLE.md), [docs/UI_PROGRESS.md](docs/UI_PROGRESS.md): dirección de arte «Archivo de Poder».
