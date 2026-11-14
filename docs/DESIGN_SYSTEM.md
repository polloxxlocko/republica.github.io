# Sistema de diseño

Fuente de verdad: `src/styles/tokens.css` (variables CSS) → `tailwind.config.js` (escalas) → `src/styles/index.css` (componentes base).

## Tokens

- **Color**: tripletas RGB (`--c-*`) para que funcione la opacidad de Tailwind (`rgb(var(--c-x) / <alpha-value>)`).
- **Compatibilidad**: las escalas heredadas se remapean al tema claro, así que el código existente adopta el sistema sin reescribirse:
  - `ink-950` → fondo, `ink-850/900` → superficie, `ink-700` → superficie 3, `ink-600` → borde;
  - `ink-400` → texto secundario, `ink-100/50` → tinta;
  - `gold-*` → burdeos;
  - `emerald` / `amber` / `red` / `sky` → verde, advertencia, peligro y azul institucionales (en sus variantes de texto, medio y tinte).
- **Tipografía**: `--fs-hero` 40–64 px, `--fs-page` 28–40, `--fs-section` 22–28, `--fs-module` 18, `--fs-body` 15, `--fs-small` 13, `--fs-meta` 11.
- **Espaciado**: múltiplos de 4 (`--sp-1` a `--sp-16`). Medida de lectura de 68ch; contenido máximo de 1440 px.
- **Radios**: 4 / 6 / 8 / 10 px. **Sombras**: solo en elementos flotantes (`shadow-pop`).
- **Movimiento**: 150 / 220 / 280 ms. Todo se desactiva con `prefers-reduced-motion`.

## Componentes base (`index.css`)

| Clase | Uso |
|---|---|
| `.panel`, `.panel-h`, `.panel-t` | Contenedor plano con borde; título serif de 17 px |
| `.kicker` | Antetítulo mono en mayúsculas (sección, fecha, fuente) |
| `.eyebrow` | Rótulo pequeño en burdeos |
| `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-link` | Acciones. Mínimo 36 px de alto; solo una acción primaria por bloque |
| `.chip` | Etiquetas de datos (partido, edad, comuna) |
| `.tab` / `.tab-on` | Pestañas con subrayado burdeos |
| `.table`, `.input`, `.rule` | Tablas, campos y filetes |

## Componentes React

- `Portrait`: silueta editorial con franja del color del partido (ver CHARACTER_ART_STYLE.md).
- `TerritorialPhoto` / `PhotoCaption` / `CartographicFallback` / `LocatorMap`: fotografía con crédito y su respaldo cartográfico.
- `TerritorialDossier`: cabecera documental de una comuna.
- `Section` (en CareerCenter): sección editorial con kicker, título y filete.
- `Bar`, `Stat`, `PartyChip`, `Badge`, `IdeologyBars`, `Tabs`, `Empty`.

## Reglas

- El texto nunca usa el color de una serie. Los valores van en tinta y el color identifica la marca.
- El estado nunca se comunica solo con color: los puntos del informe de situación tienen texto alternativo y las alertas llevan rótulo.
- Foco visible con contorno burdeos. Objetivos táctiles de al menos 36 px (44 px en la navegación móvil).
- Gráficos: un solo eje, rejilla recesiva y tooltip claro. Una serie con menos de 4 puntos no se grafica (se muestra un texto).
