# Dirección de arte: «Archivo de Poder»

## Concepto

*República: Chile* se presenta como un **expediente político vivo**. La referencia es el periodismo de investigación impreso y los archivos institucionales: papel marfil, tinta azul-pizarra, un burdeos de sello oficial y fotografía documental real del territorio. El juego **no** debe parecer un panel SaaS, un tablero de criptomonedas ni un juego de estrategia de fantasía.

Principios:

1. **Documento antes que tablero.** Jerarquía tipográfica de periódico (titular serif, bajada, metadatos en mono) en lugar de tarjetas KPI repetidas.
2. **Territorio real.** Cada región se ve con una fotografía verificada y su geometría oficial. Nada inventado y nada de otro lugar sin rotular.
3. **Un asunto principal por pantalla.** El Centro de Carrera destaca una sola cosa: la oportunidad, la candidatura, la crisis o el titular de la semana.
4. **El color significa algo.** Los colores de partido solo aparecen en datos (chips, barras, mapas). La interfaz usa burdeos para la acción principal y la selección, y verde, azul, ámbar y rojo para estados semánticos.
5. **Densidad adaptativa.** La interfaz crece con la carrera: quien empieza ve su comuna y su red; quien tiene alcance nacional ve el pulso del país (ver «Etapas»).
6. **Honestidad sobre lo real.** Las personas reales se marcan con ◆ y la leyenda «conducta simulada». Las fotografías llevan crédito y licencia visibles. Las estimaciones se rotulan como tales.

## Paleta

| Rol | Token | Hex |
|---|---|---|
| Fondo (marfil) | `--c-bg` | #F4F0E8 |
| Superficie | `--c-surface` | #FCFAF6 |
| Superficie secundaria / terciaria | `--c-surface-2/3` | #EAE4D9 / #DDD6CA |
| Borde | `--c-border` | #CEC6B9 |
| Tinta principal | `--c-ink` | #27313B |
| Texto secundario | `--c-muted` | #5C6369 (oscurecido desde #626A71 para cumplir AA en todas las superficies) |
| Burdeos (acción, selección) | `--c-burgundy` / `-deep` | #782F3D / #59232F |
| Latón (solo decoración, nunca texto) | `--c-brass` | #C5A579 |
| Verde institucional | `--c-green` | #48665B |
| Azul institucional | `--c-blue` | #465B70 |
| Advertencia | `--c-warn` / texto | #A66938 / #8A5426 |
| Peligro | `--c-danger` | #A44343 |

Los contrastes medidos están en `src/styles/tokens.css`. La paleta de gráficos y mapas (categórica, secuencial y divergente sobre fondo claro) está en `src/components/colorScales.ts` y se validó para daltonismo. Tres colores categóricos tienen contraste bajo frente a la superficie, así que siempre van acompañados de etiqueta o leyenda.

## Tipografía

- **Newsreader** (serif): titulares, nombres propios, bajadas y textos editoriales.
- **IBM Plex Sans**: interfaz, controles y párrafos de ayuda.
- **IBM Plex Mono**: cifras, fechas, códigos y *kickers* (antetítulos en mayúsculas espaciadas).

Las fuentes se sirven localmente con `@fontsource` (OFL), sin depender de Google Fonts.

## Fotografía

Ver [PHOTO_SOURCES.md](PHOTO_SOURCES.md). En resumen: solo Commons con licencia libre verificada, crédito visible, sin retoque, rótulo honesto cuando la foto es regional y respaldo cartográfico cuando no hay foto.

## Retratos

Ver [CHARACTER_ART_STYLE.md](CHARACTER_ART_STYLE.md). Por ahora son siluetas editoriales uniformes; el arte ilustrado definitivo está pendiente.

## Etapas de carrera (A–E)

`src/game/career/stage.ts` deriva la etapa de las responsabilidades reales, no de niveles: **comienzo → consolidación → poder institucional → poder nacional → presidencia**. La etapa decide:

- qué módulos muestra el Centro de Carrera (por ejemplo, el pulso del país solo con alcance nacional);
- el orden del grupo «Política nacional» en la navegación.

Las trayectorias no son lineales: quien preside un partido tiene alcance nacional sin ocupar un cargo público.
