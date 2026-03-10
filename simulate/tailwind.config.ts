import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        flow: {
          green: '#00ef8b',
          'green-dim': 'rgba(0, 239, 139, 0.15)',
        },
      },
      fontFamily: {
        mono: ['"Geist Mono"', '"SF Mono"', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
