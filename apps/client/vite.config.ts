import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'VicioTown — escritório virtual',
        short_name: 'VicioTown',
        description: 'O escritório virtual da equipe: avatares, salas, café e reuniões.',
        theme_color: '#14161c',
        background_color: '#0b0d12',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        // Ícone único em SVG: escala para qualquer densidade sem gerar seis
        // PNGs, e os navegadores que suportam PWA hoje aceitam SVG.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Nada de cachear matchmaking/WebSocket: o service worker só serve o
        // shell do app — dados do mundo são sempre ao vivo.
        navigateFallbackDenylist: [/^\/api/, /^\/matchmake/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    host: true,
    // A API REST vem por proxy; o Colyseus fala direto com a porta 3000
    // (`VITE_GAME_SERVER`). O WebSocket dele usa um caminho dinâmico
    // (`/<processo>/<sala>`), que colidiria com o socket de HMR do Vite se
    // fosse passar por proxy aqui.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },

  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Phaser já sai sozinho por causa do `import()` dinâmico em
        // GameCanvas. Aqui só separamos as bibliotecas estáveis: elas ficam
        // no cache do navegador entre deploys, em vez de invalidar junto
        // com o código da aplicação a cada publicação.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('phaser')) return 'phaser';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('colyseus')) return 'net';
          return undefined;
        },
      },
    },
  },
});
