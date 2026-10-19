import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    watch: { ignored: ['**/tmp/**', '**/public/assets/**', '**/dist/**'], usePolling: true, interval: 700 },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase-auth': ['firebase/app', 'firebase/auth'],
          'firebase-data': ['firebase/firestore'],
        },
      },
    },
  },
});
