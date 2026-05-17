import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use our custom service worker so we can handle push events
      strategies: 'injectManifest',
      srcDir:     'src',
      filename:   'sw.ts',
      // Reference the actual files present in public/
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
        'logo-transparent.png',
      ],
      manifest: {
        name: 'Flo Sisterlocks',
        short_name: 'Flobooking',
        description: 'Flo Sisterlocks — Certified Sisterlocks studio in Eldoret',
        start_url: '/',
        theme_color: '#f5f5f5',
        background_color: '#f5f5f5',
        display: 'standalone',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            // maskable icon — browser uses this for adaptive icon shapes
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy all /api requests to the backend server during development.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
