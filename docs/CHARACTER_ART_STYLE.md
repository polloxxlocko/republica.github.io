# Estilo de personajes

## Estado actual: siluetas editoriales (provisional)

`Portrait` (`src/components/ui.tsx`) dibuja un **busto en silueta** determinista a partir del `seed` (id del personaje):

- cabeza, cuello y hombros en tinta sobre papel, con cuatro variantes de peinado;
- iniciales en Plex Mono cuando el tamaño es de 40 px o más;
- franja inferior de 3 px con el color del partido, como único color;
- marco cuadrado (fichas) o redondo (listas compactas);
- `aria-label="Retrato (silueta editorial): Nombre"`.

Personas reales y ficticias usan **el mismo lenguaje** y ninguna intenta parecerse a nadie. Las personas reales se identifican por nombre y por la marca ◆, nunca por el retrato.

## Arte definitivo (pendiente)

Retratos **ilustrados** uniformes en clave de grabado o tinta editorial:

- dos tintas (tinta #27313B sobre papel #FCFAF6) más el burdeos como acento;
- encuadre de busto, tres cuartos, luz lateral suave y trama de líneas;
- personajes ficticios: generados por un artista (o un sistema paramétrico de rasgos ilustrados) con diversidad de edad, género y origen coherente con Chile;
- personas reales: **sin** retrato hasta contar con ilustraciones encargadas a partir de referencias con licencia. Nunca retratos sintéticos fotorrealistas.

Hasta entonces, la silueta es el estándar y no debe mezclarse con otros estilos.
