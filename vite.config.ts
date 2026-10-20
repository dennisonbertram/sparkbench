import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/api';

// Cross-origin isolation is required for SharedArrayBuffer (live simulator inputs).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: { headers: isolation, port: 5173 },
  preview: { headers: isolation, port: 4173 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@micropython/micropython-webassembly-pyscript'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
