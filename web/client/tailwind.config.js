/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: {
          DEFAULT: '#0B1426',
          deep: '#060A13',
        },
        card: '#121E36',
        cardlite: '#16244180',
        electric: '#3B82F6',
        cyan: '#00E5FF',
        amber: '#F59E0B',
        success: '#22C55E',
        danger: '#EF4444',
        muted: '#7C8BA6',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 24px rgba(0, 229, 255, 0.45), 0 0 4px rgba(0, 229, 255, 0.6)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.45)',
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0,229,255,0.35)' },
          '50%': { boxShadow: '0 0 34px rgba(0,229,255,0.65)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
