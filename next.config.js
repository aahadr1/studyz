/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase body size limit for file uploads (50MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Exclude native modules from webpack bundling
    serverComponentsExternalPackages: [
      'pdf-to-png-converter',
      '@napi-rs/canvas',
      'canvas',
      'mupdf',
    ],
  },
  // Also exclude from webpack for API routes
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'pdf-to-png-converter': 'commonjs pdf-to-png-converter',
        '@napi-rs/canvas': 'commonjs @napi-rs/canvas',
        'canvas': 'commonjs canvas',
        'mupdf': 'commonjs mupdf',
      })
    }
    return config
  },
}

module.exports = nextConfig