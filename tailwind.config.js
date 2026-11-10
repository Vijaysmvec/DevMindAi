/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        singularity: {
          void: '#000000',
          space: '#030407',
          obsidian: '#090D14',
          navy: '#101827',
          gold: '#FFB347',
          amber: '#E88732',
          plasma: '#FF7838',
          stellar: '#FFF0D5',
          cyan: '#56D9FF',
          blue: '#2879C7',
          violet: '#8765D8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
