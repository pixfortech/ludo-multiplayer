/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', "ui-rounded", "system-ui", "sans-serif"],
      },
      keyframes: {
        blob: {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(24px, -36px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.92)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Dice shake: rattles during the roll wait
        shake: {
          "0%, 100%": { transform: "rotate(0deg) scale(1)" },
          "15%": { transform: "rotate(-10deg) scale(1.08)" },
          "30%": { transform: "rotate(9deg) scale(1.1)" },
          "45%": { transform: "rotate(-7deg) scale(1.07)" },
          "60%": { transform: "rotate(7deg) scale(1.1)" },
          "75%": { transform: "rotate(-3deg) scale(1.04)" },
          "90%": { transform: "rotate(3deg)" },
        },
        // Golden throb used on the dice face and player panel when a 6 is rolled
        "six-throb": {
          "0%, 100%": { boxShadow: "0 0 8px 2px rgba(251,191,36,.7)" },
          "50%": { boxShadow: "0 0 28px 10px rgba(251,191,36,1)" },
        },
        // Slide-pop for the player card that just became the active player
        "turn-in": {
          from: { transform: "scale(0.96) translateX(-6px)", opacity: "0.5" },
          to: { transform: "scale(1) translateX(0)", opacity: "1" },
        },
      },
      animation: {
        blob: "blob 14s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.4s ease-out both",
        "pop-in": "pop-in 0.25s ease-out both",
        shake: "shake 0.55s ease-in-out",
        "six-throb": "six-throb 0.85s ease-in-out infinite",
        "turn-in": "turn-in 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};
