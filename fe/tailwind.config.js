/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0D1164',
          50: '#e8e9f6',
          100: '#d1d3ed',
          500: '#0D1164',
          600: '#0a0e56',
          700: '#080a47',
        },
        secondary: {
          DEFAULT: '#640D5F',
          50: '#f4e8f3',
          100: '#e9d1e7',
          500: '#640D5F',
          600: '#590b55',
        },
        accent: {
          DEFAULT: '#EA2264',
          50: '#fce7ed',
          100: '#f9cfdb',
          500: '#EA2264',
          600: '#d41e5a',
          700: '#c01b52',
        },
        warning: {
          DEFAULT: '#F78D60',
          50: '#fef4f0',
          100: '#fde9e1',
          500: '#F78D60',
          600: '#f47c54',
        },
      },
    },
  },
  plugins: [],
} 