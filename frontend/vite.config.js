import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Belkovanya Todo',
        short_name: 'Todo',
        description: 'Еженедельный планировщик задач с синхронизацией',
        theme_color: '#4a90d9',
        background_color: '#f5f5f5',
        display: 'standalone',
        scope: '/todo/',
        start_url: '/todo/',
        icons: [
          {
            src: '/todo/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/todo/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  base: '/todo/',
});
