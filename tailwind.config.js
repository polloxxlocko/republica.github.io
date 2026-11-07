/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 950: '#0b0f17', 900: '#111827', 850: '#151c2b', 800: '#1b2436', 700: '#263249', 600: '#37445f', 500: '#5b6782', 400: '#8a94ab', 300: '#b7bfd0', 200: '#dde2ec', 100: '#f1f3f8' },
        gold: { 500: '#c9a24a', 400: '#d9b968', 300: '#e9d39c' },
        rojo: { 500: '#d23a3a' },
      },
    },
  },
  plugins: [],
};
