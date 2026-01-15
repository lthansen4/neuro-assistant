/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1A1C2E",
          green: "#006747",
        },
        rainbow: {
          reading: "#E5945C", // Terracotta/Peach
          homework: "#006747", // Signature Green
          tests: "#5C7EA5", // Slate Blue
          chill: "#8B5CF6", // Muted Purple
          notes: "#D4AF37", // Earthy Gold
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      animation: {
        'fade-in': 'fade-in 1s ease-out forwards',
        'fade-in-delayed': 'fade-in 1s ease-out 0.5s forwards',
        'slide-up': 'slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'paint-drip': 'paint-drip 10s ease-in-out infinite alternate',
      },
      keyframes: {
        'fade-in': {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        'slide-up': {
          'from': { transform: 'translateY(20px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
        'paint-drip': {
          '0%': { transform: 'translateY(-10%) scaleY(1)', opacity: '0.1' },
          '50%': { opacity: '0.2' },
          '100%': { transform: 'translateY(10%) scaleY(1.2)', opacity: '0.1' },
        }
      },
    },
  },
  plugins: [],
};
