/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#1A1C2E",
          green: "#006747",
          gesso: "#F2F0E9",
        },
        rainbow: {
          reading: "#F5E6D3", // Soft Creamy Terracotta
          homework: "#E2E8D5", // Pale Sage
          tests: "#D7E3F1", // Soft Sky
          chill: "#E5E1F1", // Pale Lavender
          notes: "#F9F1D8", // Soft Gold
        },
        accent: {
          reading: "#E5945C",
          homework: "#4A5D23",
          tests: "#5C7EA5",
          chill: "#7C6A96",
          notes: "#D4AF37",
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
              borderRadius: {
                '2xl': '16px',
                '3xl': '24px',
                '4xl': '32px',
              },
              boxShadow: {
                'aura-moss': '0 0 30px -5px rgba(74, 93, 35, 0.3)',
                'aura-terracotta': '0 0 30px -5px rgba(229, 148, 92, 0.3)',
                'aura-violet': '0 0 30px -5px rgba(124, 106, 150, 0.3)',
                'aura-gold': '0 0 30px -5px rgba(212, 175, 55, 0.3)',
                'aura-slate': '0 0 30px -5px rgba(92, 126, 165, 0.3)',
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
