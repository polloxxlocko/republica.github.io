# Despliegue en GitHub Pages

## Requisitos

- Repositorio en GitHub con este proyecto en la rama `main`.
- En **Settings → Pages → Build and deployment**, elegir **Source: GitHub Actions**.

## Flujo automático

`.github/workflows/deploy.yml` se ejecuta en cada push a `main` (y también manualmente con *Run workflow*):

1. `npm ci`
2. `npm test` (pruebas unitarias)
3. `npm run build` con `VITE_BASE=/${{ github.event.repository.name }}/`
4. Copia `dist/index.html` a `dist/404.html` (respaldo para SPA)
5. Publica `dist/` con `actions/deploy-pages`

URL resultante: `https://USUARIO.github.io/NOMBRE-REPOSITORIO/`.

`.github/workflows/ci.yml` corre typecheck, pruebas, build y E2E en ramas y PR.

## Rutas y recursos

- La aplicación **no asume la raíz del dominio**. Con `VITE_BASE` todos los recursos se resuelven bajo la subcarpeta. Sin la variable, la base es `./` (rutas relativas), lo que también funciona en subcarpetas.
- La navegación usa el *hash* (`#/partidos`), así que GitHub Pages nunca recibe rutas desconocidas.
- `public/.nojekyll` evita el procesamiento de Jekyll.

## Prueba local de la compilación de producción

```bash
VITE_BASE=/republica-chile/ npm run build
```

```bash
npx vite preview --base /republica-chile/
```

## Estado

Repositorio: `polloxxlocko/republica.github.io`. URL esperada: `https://polloxxlocko.github.io/republica.github.io/`. Requiere que Pages use **Source: GitHub Actions**.
