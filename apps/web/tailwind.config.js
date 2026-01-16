/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          gesso: "#FAF7F2",
          surface: "#FFFFFF",
          "surface-2": "#F6F2EA",
          text: "#151515",
          muted: "#5C5C5C",
          primary: "#6D5EF7", // Electric Purple
          mint: "#2ED3B7",
          amber: "#FFB020",
          rose: "#FF4D8D",
          green: "#006747", // Keeping for legacy if needed, but primary is now purple
          blue: "#1A1C2E",
        },
        category: {
          class: {
            fg: "#2F6BFF",
            bg: "rgba(47,107,255,0.10)",
          },
          deep: {
            fg: "#1B9C6E",
            bg: "rgba(27,156,110,0.12)",
          },
          reset: {
            fg: "#F08A5D",
            bg: "rgba(240,138,93,0.14)",
          },
          due: {
            fg: "#FF4D8D",
            bg: "rgba(255,77,141,0.12)",
          },
          exam: {
            fg: "#FF3B30",
            bg: "rgba(255,59,48,0.12)",
          },
          wall: {
            fg: "#7C4DFF",
            bg: "rgba(124,77,255,0.12)",
          },
        }
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "serif"],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
        'xl-card': '20px',
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0,0,0,0.05)',
        'aura-moss': '0 0 30px -5px rgba(74, 93, 35, 0.3)',
        'aura-terracotta': '0 0 30px -5px rgba(229, 148, 92, 0.3)',
        'aura-violet': '0 0 30px -5px rgba(124, 106, 150, 0.3)',
        'aura-gold': '0 0 30px -5px rgba(212, 175, 55, 0.3)',
        'aura-slate': '0 0 30px -5px rgba(92, 126, 165, 0.3)',
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'fade-in-delayed': 'fade-in 0.5s ease-out 0.2s forwards',
        'slide-up': 'slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-soft': 'pulse-soft 2s infinite',
      },
      keyframes: {
        'fade-in': {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        'slide-up': {
          'from': { transform: 'translateY(10px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.02)' },
        }
      },
    },
  },
  plugins: [],
};
