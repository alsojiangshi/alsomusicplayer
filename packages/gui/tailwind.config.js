/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { darkest: '#0d1117', dark: '#161b22', medium: '#1c2333', light: '#21262d', card: '#252d3a' },
        border: { DEFAULT: '#30363d', hover: '#484f58' },
        accent: { DEFAULT: '#00d2ff', hover: '#00e5ff', dim: '#0f3460' },
        text: { primary: '#e6edf3', secondary: '#8b949e', muted: '#6e7681' },
      },
    },
  },
  plugins: [],
};
