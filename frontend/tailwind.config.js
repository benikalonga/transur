/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 🇨🇩 Drapeau RDC — Bleu, Rouge, Blanc
        primary: {
          50:  '#e6f2fa',
          100: '#c0dff3',
          200: '#8fc4e8',
          300: '#5aaada',
          400: '#2d93ce',
          500: '#007DC5',  // Bleu DRC (ciel)
          600: '#006aaa',
          700: '#00538c',
          800: '#003d6e',
          900: '#002850',
        },
        congo: {
          blue:   '#007DC5',  // Bleu ciel du drapeau
          red:    '#CE1126',  // Rouge du drapeau
          yellow: '#F7D618',  // Jaune/or de l'étoile
        },
        dark: '#0d1b2a',  // Bleu nuit profond
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
