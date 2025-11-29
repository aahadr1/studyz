/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configure headers for PDF.js worker and CSP
  async headers() {
    return [
      {
        // PDF worker file headers
        source: '/pdf.worker.min.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // CSP headers for PDF.js worker support
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "worker-src 'self' blob:; script-src 'self' 'unsafe-eval' 'unsafe-inline';",
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig