import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        beige: '#F5F5DC',
        orange: {
          DEFAULT: '#FF8C00',
          dark: '#E07800',
        },
      },
    },
  },
  plugins: [],
};

export default config;
