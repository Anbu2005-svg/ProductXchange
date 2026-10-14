/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2b24",
        moss: "#2f6b4f",
        clay: "#c76a3f",
        sand: "#f6f3ec",
      },
    },
  },
  plugins: [],
};
