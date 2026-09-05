import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-192.png', 'favicon-512.png', 'og-image.svg', 'robots.txt'],
      manifest: {
        name: 'DokuLens — Studio Olah Dokumen Client-Side',
        short_name: 'DokuLens',
        description: 'Edit, merge, compress, convert PDF, Word, dan gambar 100% di browser tanpa upload dan tanpa database.',
        theme_color: '#2563eb',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024, // 40MB for onnxruntime WASM + heavy engines
        runtimeCaching: [
          {
            urlPattern: /https:\/\/staticimgly\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'imgly-model-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdf-lib') || id.includes('node_modules/@cantoo/pdf-lib')) return 'pdf-lib'
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
          if (id.includes('node_modules/jszip')) return 'jszip'
          if (id.includes('node_modules/docx')) return 'docx'
          if (id.includes('node_modules/mammoth')) return 'mammoth'
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
})
