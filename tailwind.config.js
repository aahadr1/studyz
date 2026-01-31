/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Modern dark palette with depth
        background: '#0d0d0d',      // Deep dark
        surface: '#171717',          // Slightly elevated
        elevated: '#1f1f1f',         // Cards and panels
        hover: '#262626',            // Hover states
        subtle: '#2a2a2a',           // Subtle elements
        border: '#2a2a2a',           // Refined borders
        'border-light': '#404040',   // Lighter borders
        sidebar: '#171717',          // Sidebar background
        
        // Text colors - refined gray scale
        'text-primary': '#ececec',   // Main text
        'text-secondary': '#b4b4b4', // Secondary text
        'text-tertiary': '#737373',  // Tertiary text
        'text-muted': '#525252',     // Muted text
        
        // Semantic colors for functional states
        success: {
          DEFAULT: '#10b981',
          light: '#34d399',
          muted: 'rgba(16, 185, 129, 0.12)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          muted: 'rgba(245, 158, 11, 0.12)',
        },
        error: {
          DEFAULT: '#ef4444',
          light: '#f87171',
          muted: 'rgba(239, 68, 68, 0.12)',
        },
        
        // Mode colors - vibrant but refined
        mode: {
          study: '#3b82f6',      // Blue
          test: '#8b5cf6',       // Purple  
          challenge: '#f97316',  // Orange
          review: '#06b6d4',     // Cyan
        },
        
        // Accent colors
        accent: {
          DEFAULT: '#ececec',
          hover: '#ffffff',
          muted: 'rgba(236, 236, 236, 0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['0.9375rem', { lineHeight: '1.5rem' }],
        'lg': ['1.0625rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }],
        '5xl': ['3rem', { lineHeight: '3.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      // Modern rounded design
      borderRadius: {
        'none': '0',
        'sm': '0.375rem',
        'DEFAULT': '0.5rem',
        'md': '0.625rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.25rem',
        'full': '9999px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px -1px rgba(0, 0, 0, 0.4)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        'inner': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.3)',
        'none': 'none',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'spin': 'spin 0.8s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      transitionDuration: {
        '100': '100ms',
        '150': '150ms',
      },
    },
  },
  plugins: [],
}
