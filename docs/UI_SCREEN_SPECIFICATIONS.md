# Especificación de pantallas

Puntos de corte probados: 390×844, 768×1024, 1366×768, 1440×900 y 1920×1080.

## 1. Portada (`MainMenu.tsx`) — pantalla maestra

- **Composición asimétrica** (5/7 columnas desde `lg`). A la izquierda: kicker, título serif «República: Chile» y bajada en serif 18 px. A la derecha: fotografía principal con crédito y, debajo, el aviso legal.
- **Acciones**:
  - «Continuar» (primaria, solo si existe un guardado; muestra nombre y fecha);
  - «Nueva carrera» (primaria si no hay guardado; `data-testid="nueva-partida"`);
  - «Importar partida»;
  - enlace a «Créditos, fuentes y licencias».
- **Expedientes guardados**: lista con filetes; exportar y eliminar en cada fila.
- **Fotografía**: una principal distinta cada día (determinista); carga prioritaria (`eager`, `fetchpriority=high`).
- **Móvil**: una columna; la foto va después de las acciones.

## 2. Centro de Carrera (`CareerCenter.tsx`) — pantalla maestra; reemplaza al antiguo «Panel»

1. **Identidad**: retrato de 88 px, kicker «Expediente · fecha», nombre en serif, cargo y chips (partido, edad, comuna · región, aspiración). A la derecha: recursos, puntos de acción y próxima elección, en mono.
2. **Etapa**: los cinco hitos de la etapa (`aria-current="step"`) y el alcance. No hay barra de experiencia.
3. **Asunto central** (uno solo, por prioridad): fin de carrera › oportunidad abierta (con a favor y riesgos) › candidatura › crisis › titular de la semana. Tiene un borde lateral de 4 px y un botón primario que lleva a la pantalla donde se decide.
4. **Informe de situación**: lecturas con su tono (los puntos tienen texto para lectores de pantalla). Debajo, la jornada y el gobierno.
5. **Módulos por etapa**:
   - «Pulso del país» (con alcance nacional);
   - calendario electoral (fuera de la etapa de comienzo);
   - encuestas (con partido o fuera del comienzo);
   - titulares (4 en el comienzo, 6 después).
6. **Columna de apoyo**: fotografía de la comuna base (o de la región, rotulada), «Lo que se comenta» (las últimas 4 informaciones de la red, con fuente y fiabilidad) y perfil (atributos e ideología).

## 3. Dossier territorial (`TerritorialDossier.tsx` en `MapScreen.tsx`) — pantalla maestra

- Al entrar en Territorio queda seleccionada la comuna base del jugador.
- **Cabecera**:
  - fotografía 16:9 más el mapa de ubicación (región con la comuna destacada);
  - kicker con la región, nombre en serif y la etiqueta «Tu base» si corresponde;
  - provincia, distrito y circunscripción;
  - crédito de la foto, con el aviso «Fotografía regional, no de esta comuna» cuando aplica.
- **Datos oficiales**: 9 indicadores (INE 2024, SERVEL 2023) en mono.
- **Autoridades en la partida**: alcaldía, gobernación, Senado y diputaciones del distrito. Cada una con partido, el rótulo «persona real · conducta simulada» o «personaje ficticio» y la relación del jugador.
- Siguen debajo: resultados de la elección elegida, trayectoria histórica, estimación para el partido y acciones territoriales.
- El mapa queda fijo (`sticky`) en pantallas anchas.

## Navegación

- La barra lateral (abajo en móvil) se agrupa en «Tu carrera» (Inicio, Carrera, Acciones, Territorio), «Política nacional» y «Archivo» (Historial, Partida).
- El orden de «Política nacional» depende de la etapa: con cargo de gobierno empieza por Gobierno; con cargo institucional, por Congreso.
- Elemento activo: fondo de superficie 2, texto burdeos y filete lateral de 3 px.

## Créditos (`Credits.tsx`)

Accesible desde la portada (sin partida) y por hash `#/creditos`. Incluye fotografías con miniatura, autoría, licencia, archivo y fecha; tipografías; y datos y cartografía.
