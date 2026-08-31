/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#fafafa',
        primary: {
          DEFAULT: '#4f46e5',
          hover: '#4338ca',
          light: '#e0e7ff',
        },
        secondary: {
          DEFAULT: '#06b6d4',
          hover: '#0891b2',
          light: '#cffafe',
        },
        heading: '#0f172a',
        body: '#334155',
        subtle: '#64748b',
        surface: {
          DEFAULT: '#ffffff',
          elevated: '#f8fafc',
          dark: '#121215',
          darkcard: '#18181b',
        },
        border: {
          light: '#e2e8f0',
          dark: '#27272a',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ambient: '0 1px 3px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.02)',
        card: '0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -2px rgba(0, 0, 0, 0.03)',
      }
    },
  },
  plugins: [],
};
