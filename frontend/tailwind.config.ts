import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Government navy palette (Medreg standard)
        gov: {
          50:  '#e6e9f3',
          100: '#c4cbe4',
          200: '#9ea9d0',
          300: '#7787bc',
          400: '#4d5faa',
          500: '#002088',
          600: '#001b73',
          700: '#00175f',
          800: '#00124b',
          900: '#000d38',
        },
        // Gold accent (state seal / warning)
        gold: {
          50:  '#fdf3dc',
          100: '#fce4ac',
          200: '#f9d073',
          300: '#f6bd3f',
          400: '#f4a833',
          500: '#e5931b',
          600: '#c37610',
          700: '#96590a',
        },
      },
      fontFamily: {
        sans: ['var(--font-nunito)', 'Nunito', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
