import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
    loadEnv(mode, rootDir, '');
    return {
      root: rootDir,
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              charts: ['recharts'],
              spreadsheets: ['xlsx', 'jszip'],
              gemini: ['@google/genai'],
            },
          },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': rootDir,
        }
      }
    };
});
