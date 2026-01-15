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
          reading: "#FFE4D6",
          homework: "#D1FAE5",
          tests: "#E0F2FE",
          chill: "#F3E8FF",
          notes: "#FEF9C3",
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
      },
    },
  },
  plugins: [],
};
