import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    dedupe: ['yjs', 'y-protocols', 'y-websocket', 'y-indexeddb']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'pyodide/**/*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,data,zip}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB limit to precache Pyodide wasm & data files
      },
      manifest: {
        name: 'OffCode - Offline Multiplayer Code Editor',
        short_name: 'OffCode',
        description: 'Collaborative code editor that works offline with CRDT sync',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ]
});
