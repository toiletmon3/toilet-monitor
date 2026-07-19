import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        // Precache the kiosk artwork (images + videos, ~4MB total) too, so the
        // designed kiosk templates keep working offline instead of falling back
        // to the plain classic look. The default 2 MiB per-file cap would drop
        // the ~1.9MB background image, so raise it.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp4,mp3}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Toilet Monitor',
        short_name: 'ToiletMon',
        description: 'Smart restroom monitoring system',
        theme_color: '#00e5cc',
        background_color: '#0a0e1a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/cleaner',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  build: {
    // Target Chrome 67+ (Android 7 can run Chrome 67+)
    target: ['chrome67', 'firefox68', 'safari12'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
