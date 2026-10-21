import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        // Single source of truth for the dark gamer theme. Values mirror the
        // CSS variables in globals.css so both Tailwind utilities and hand-written
        // CSS stay in sync.
        bg: '#0B0D14',
        surface: '#141824',
        border: '#2A3147',
        inactive: '#1E2538',
        accent: {
          DEFAULT: '#C6FF3D',
          fg: '#0B0D14',
        },
        text: {
          DEFAULT: '#FFFFFF',
          muted: '#9AA3B8',
        },
      },
      fontFamily: {
        heading: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        control: '12px',
        card: '20px',
        panel: '24px',
        hero: '28px',
      },
      maxWidth: {
        shell: '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
