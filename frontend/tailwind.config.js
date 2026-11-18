/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F1EEFF',
          100: '#E3DDFF',
          200: '#C7BBFF',
          300: '#A592FF',
          400: '#7F66FA',
          500: '#5B3DF5',
          600: '#4A2BE0',
          700: '#3B20B8',
          800: '#2D1A8C',
          900: '#1E1260',
        },
        volt: '#FFB020',
        ink: {
          DEFAULT: '#0E0E1A',
          soft: '#2A2A3C',
          muted: '#6B6B80',
          faint: '#A3A3B5',
        },
        canvas: '#F6F5FA',
        line: '#E7E5EF',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      boxShadow: {
        float: '0 10px 30px -10px rgba(14,14,26,.25)',
      },
    },
  },
  plugins: [],
};
