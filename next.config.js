/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for file uploads (50MB)
  eslint: {
    // This repo doesn't ship with eslint installed; skip it during builds so `next build` stays clean/non-interactive.
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Vercel/Next output file tracing can miss PDF.js worker files because they are loaded dynamically.
    // Force-include them so server-side PDF rendering works in production.
    outputFileTracingIncludes: {
      '/api/intelligent-podcast/[id]/process': [
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      ],
    },
    // Exclude native modules from webpack bundling
    serverComponentsExternalPackages: [
      'pdf-to-png-converter',
      'canvas',
      'pdfjs-dist',
      'pdfkit',
      '@google-cloud/text-to-speech',
    ],
  },
  // Also exclude from webpack for API routes
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'pdf-to-png-converter': 'commonjs pdf-to-png-converter',
        'canvas': 'commonjs canvas',
        'pdfkit': 'commonjs pdfkit',
      })
    }
    return config
  },
}

module.exports = nextConfig