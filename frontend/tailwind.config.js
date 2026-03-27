/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: {
          50: 'var(--bg-tertiary)',
          100: 'var(--bg-tertiary)',
          200: 'var(--border-light)',
          300: 'var(--border-light)',
          400: 'var(--text-tertiary)',
          500: 'var(--text-tertiary)',
          600: 'var(--text-secondary)',
          700: 'var(--text-secondary)',
          800: 'var(--text-primary)',
          900: 'var(--text-primary)',
        },
      },
    },
  },
  plugins: [],
}
