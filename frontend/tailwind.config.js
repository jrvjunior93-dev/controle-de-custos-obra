/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{ts,tsx}",
    "./utils/**/*.{ts,tsx}",
    "./apiClient.ts",
    "./types.ts"
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
