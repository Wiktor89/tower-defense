import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        towerDefense: resolve(__dirname, 'games/tower-defense/index.html'),
        mathColumns: resolve(__dirname, 'games/math-columns/index.html'),
        fillBlanks: resolve(__dirname, 'games/fill-blanks/index.html'),
        disassemble: resolve(__dirname, 'games/disassemble/index.html'),
        fractions: resolve(__dirname, 'games/fractions/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8089',
    },
  },
});
