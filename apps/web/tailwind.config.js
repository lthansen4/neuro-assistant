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
    },
  },
  plugins: [],
};
