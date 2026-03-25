/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        wallet: {
          primary: '#00ef8b',
          'primary-foreground': '#000000',
          secondary: '#6366f1',
          bg: '#0a0a0a',
          card: '#1a1a1a',
          'card-hover': '#2a2a2a',
          muted: '#a1a1aa',
          border: '#27272a',
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
