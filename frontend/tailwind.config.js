/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-bid': 'flashBid 1.2s ease-out',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        flashBid: {
          '0%': { backgroundColor: 'rgba(99, 102, 241, 0.35)', transform: 'scale(1.02)' },
          '100%': { backgroundColor: 'transparent', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
