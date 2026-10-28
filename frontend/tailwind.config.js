/** @type {import('tailwindcss').Config} */

// One accent for the whole product: an electric aqua that reads as "charging".
// `teal` is aliased to it so every existing teal-* class picks up the same palette.
const brand = {
  50: '#effefb',
  100: '#c8fff4',
  200: '#91fde9',
  300: '#53f3db',
  400: '#1fdcc5',
  500: '#06bfab',
  600: '#009a8c',
  700: '#057b71',
  800: '#0a615b',
  900: '#0d504c',
  950: '#003130',
};

// Deep navy used for dark surfaces (landing, battery lab, overlays).
const ink = {
  600: '#26324f',
  700: '#1b2540',
  800: '#111a2f',
  900: '#0a1122',
  950: '#050913',
};

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          ...brand,
          DEFAULT: brand[500],
          // legacy aliases still referenced in a few components
          dark: ink[950],
          navy: ink[900],
          card: ink[800],
          border: '#1e293b',
          accent: brand[400],
          accentHover: brand[500],
          blue: '#0284c7',
          cyan: '#06b6d4',
          warning: '#f59e0b',
          danger: '#ef4444',
        },
        teal: brand,
        ink,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        'card-hover': '0 2px 4px rgba(15, 23, 42, 0.05), 0 18px 40px -16px rgba(15, 23, 42, 0.22)',
        glow: '0 10px 30px -10px rgba(31, 220, 197, 0.55)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
