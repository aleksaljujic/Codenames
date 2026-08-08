/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Rubik', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
