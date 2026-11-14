/** @type {import('tailwindcss').Config} */
/*
 * Las escalas heredadas (ink, gold, emerald, amber, red, sky) se reasignan a los tokens semánticos
 * de «Archivo de Poder» (src/styles/tokens.css). Así toda la interfaz existente adopta el tema claro
 * sin perder funcionalidad. Convención: números bajos = texto/acento intenso; altos = superficies.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const semantic = (text, mid, tint) => ({ 50: v(text), 100: v(text), 200: v(text), 300: v(text), 400: v(text), 500: v(mid), 600: v(mid), 700: v(mid), 800: v(tint), 900: v(tint), 950: v(tint) });
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    extend: {
      fontFamily: {
        display: ['Newsreader', '"Source Serif 4"', 'Georgia', 'serif'],
        serif: ['Newsreader', '"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', '"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: v('c-bg'), surface: v('c-surface'), 'surface-2': v('c-surface-2'), 'surface-3': v('c-surface-3'), line: v('c-border'),
        burgundy: { DEFAULT: v('c-burgundy'), deep: v('c-burgundy-deep') },
        brass: { DEFAULT: v('c-brass'), deep: v('c-brass-deep') },
        ink: {
          50: v('c-ink-strong'), 100: v('c-ink'), 200: v('c-ink-2'), 300: v('c-ink-3'), 400: v('c-muted'), 500: v('c-faint'),
          600: v('c-border'), 700: v('c-surface-3'), 800: v('c-surface-2'), 850: v('c-surface'), 900: v('c-surface'), 950: v('c-bg'),
        },
        gold: { 200: v('c-burgundy-deep'), 300: v('c-burgundy-deep'), 400: v('c-burgundy'), 500: v('c-burgundy'), 600: v('c-burgundy-deep') },
        rojo: { 500: v('c-danger') },
        emerald: semantic('c-green-text', 'c-green', 'c-green-tint'),
        amber: semantic('c-warn-text', 'c-warn', 'c-warn-tint'),
        red: semantic('c-danger-text', 'c-danger', 'c-danger-tint'),
        sky: semantic('c-blue-text', 'c-blue', 'c-blue-tint'),
      },
      borderRadius: { sm: 'var(--radius-sm)', DEFAULT: 'var(--radius-md)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-xl)' },
      boxShadow: { pop: 'var(--shadow-pop)' },
      transitionDuration: { micro: '150ms', panel: '220ms', screen: '280ms' },
      maxWidth: { measure: 'var(--measure)', content: 'var(--max-content)' },
    },
  },
  plugins: [],
};
