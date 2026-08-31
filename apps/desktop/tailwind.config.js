/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#fafafa',
          dark: '#09090b',
        },
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          light: '#e0e7ff',
          dark: '#3730a3',
        },
        secondary: {
          DEFAULT: '#06b6d4',
          hover: '#0891b2',
          light: '#cffafe',
        },
        heading: {
          DEFAULT: '#09090b',
          dark: '#f4f4f5',
        },
        body: '#27272a',
        subtle: '#71717a',
        surface: {
          DEFAULT: '#ffffff',
          elevated: '#f4f4f5',
          dark: '#121215',
          darkcard: '#18181f',
          darkelevated: '#1c1c24',
        },
        border: {
          light: '#e4e4e7',
          dark: '#27272a',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ambient: '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
        glow: '0 0 20px -3px rgba(79, 70, 229, 0.25)',
        cyanGlow: '0 0 20px -3px rgba(6, 182, 212, 0.25)',
      }
    },
  },
  plugins: [],
};
