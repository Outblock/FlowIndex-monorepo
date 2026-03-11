import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        flow: {
          green: '#00ef8b',
          'green-dim': 'rgba(0, 239, 139, 0.15)',
        },
      },
      fontFamily: {
        mono: ['"Geist Mono"', '"SF Mono"', 'monospace'],
        'pixel-square': ['"Geist Pixel Square"', 'monospace'],
        'pixel-circle': ['"Geist Pixel Circle"', 'monospace'],
        'pixel-grid': ['"Geist Pixel Grid"', 'monospace'],
      },
      backgroundImage: {
        'radial-gradient': 'radial-gradient(var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
