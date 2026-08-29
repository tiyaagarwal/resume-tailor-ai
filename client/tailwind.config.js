/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF8F3',
        ink: {
          DEFAULT: '#1C1B18',
          soft: '#4A463D',
          faint: '#8B8575',
        },
        line: '#E4DDC9',
        // "press": the letterpress-ink primary — deep teal, used for actions and links.
        press: {
          DEFAULT: '#22514C',
          dark: '#173B37',
        },
        // "seal": the wax-seal accent — used sparingly for the one signature
        // highlight (selection, active state), never as a background flood.
        seal: {
          DEFAULT: '#8B4A2B',
          light: '#C98B5E',
        },
        approve: '#2F7D5A',
        deny: '#B3261E',
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        sheet: '0 1px 2px rgba(28,27,24,0.05), 0 6px 16px -6px rgba(28,27,24,0.18)',
        stack: '0 1px 0 #fff, 0 2px 0 #efe9db, 0 3px 0 #fff, 0 10px 22px -8px rgba(28,27,24,0.28)',
      },
      backgroundImage: {
        grain:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};
