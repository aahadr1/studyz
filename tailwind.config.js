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
        // Pure monochrome palette
        background: '#000000',
        surface: '#0a0a0a',
        elevated: '#141414',
        subtle: '#1a1a1a',
        border: '#262626',
        'border-light': '#333333',
        sidebar: '#000000',
        
        // Text colors - pure white to grays
        'text-primary': '#ffffff',
        'text-secondary': '#a3a3a3',
        'text-tertiary': '#525252',
        
        // Semantic colors for functional states only
        success: {
          DEFAULT: '#22c55e',
          muted: 'rgba(34, 197, 94, 0.15)',
        },
        warning: {
          DEFAULT: '#eab308',
          muted: 'rgba(234, 179, 8, 0.15)',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239, 68, 68, 0.15)',
        },
        
        // Mode colors - for study modes and special UI
        mode: {
          study: '#3b82f6',      // Blue
          test: '#8b5cf6',       // Purple  
          challenge: '#f97316',  // Orange
          review: '#06b6d4',     // Cyan
        },
        
        // Accent - only for primary CTAs
        accent: {
          DEFAULT: '#ffffff',
          hover: '#e5e5e5',
          muted: 'rgba(255, 255, 255, 0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      fontSize: {
        'xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.05em' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.875rem', { lineHeight: '1.5rem' }],
        'lg': ['1rem', { lineHeight: '1.75rem' }],
        'xl': ['1.125rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem' }],
        '3xl': ['1.75rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }],
        '5xl': ['3rem', { lineHeight: '3.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      // Squared design - no border radius
      borderRadius: {
        'none': '0',
        'sm': '0',
        'DEFAULT': '0',
        'md': '0',
        'lg': '0',
        'xl': '0',
        'full': '0',
      },
      boxShadow: {
        'none': 'none',
        'sm': 'none',
        'DEFAULT': 'none',
        'md': 'none',
        'lg': 'none',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.15s ease-out',
        'slide-down': 'slideDown 0.15s ease-out',
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
