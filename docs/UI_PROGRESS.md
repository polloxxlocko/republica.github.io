# Avance de la dirección de arte

| Fase | Estado | Verificación |
|---|---|---|
| A · Auditoría de la interfaz existente | Hecho | Tema oscuro tipo dashboard, colores fijos en el código, fuentes desde Google Fonts y retratos con trama. |
| B · ART_DIRECTION y DESIGN_SYSTEM | Hecho | `docs/` |
| C · Tokens (color, tipografía, espaciado, movimiento) y tema claro global | Hecho | `tokens.css` y `tailwind.config.js`; contraste AA medido; paleta de gráficos validada para daltonismo |
| D · Tres pantallas maestras (Portada, Centro de Carrera, Dossier territorial) | Hecho | Capturas en 390, 768, 1366, 1440 y 1920 px revisadas; sin errores de consola |
| Biblioteca fotográfica: 16 regiones, 32 fotos | Hecho (2 por región) | Licencias leídas desde la API de Commons; ver PHOTO_SOURCES.md |
| Créditos en el juego | Hecho | Pantalla «Créditos» |
| Navegación agrupada por etapa | Hecho | Pruebas e2e en verde |
| E · Resto de pantallas (Carrera, Acciones, Partidos, Congreso, Elecciones, Gobierno, Economía, Noticias, Historial, Partida, Noche electoral, Nueva partida) | Pendiente | Hoy heredan el tema claro mediante el remapeo de tokens, pero conservan su estructura antigua de paneles |
| F · Retratos ilustrados definitivos | Pendiente | Se usan siluetas editoriales provisionales (CHARACTER_ART_STYLE.md) |
| G · Fotografía institucional (Congreso, La Moneda) y tercera foto por región | Pendiente | |
| H · Pulido: toasts y modal de decisión con el nuevo lenguaje, estados vacíos ilustrados | Pendiente | |

## Pruebas al cierre de la fase D

- `npm run build`: compila (aviso de tamaño de chunk preexistente).
- `vitest`: 109/109.
- `playwright`: 2/2 (selectores actualizados: título de portada sin distinguir mayúsculas).
