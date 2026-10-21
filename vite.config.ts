import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { apiPlugin } from './server/api';

// Cross-origin isolation is required for SharedArrayBuffer (live simulator inputs). The account
// page (sign-in, organizations) is the one page that must NOT be isolated: Clerk's hosted images
// and bot checks are cross-origin.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
const isAccount = (url = '') => /^\/account(\.html)?(\?|$)/.test(url);

function isolate(): Plugin {
  const mw = (req: any, res: any, next: () => void) => {
    if (isAccount(req.url)) req.url = req.url.replace(/^\/account(\.html)?/, '/account.html');
    else for (const [k, v] of Object.entries(isolation)) res.setHeader(k, v);
    next();
  };
  return {
    name: 'sparkbench-isolation',
    configureServer: (server) => void server.middlewares.use(mw),
    configurePreviewServer: (server) => void server.middlewares.use(mw),
  };
}

export default defineConfig({
  plugins: [isolate(), react(), apiPlugin()],
  server: { port: 5173 },
  preview: { port: 4173 },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@micropython/micropython-webassembly-pyscript'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, rollupOptions: { input: { main: 'index.html', account: 'account.html' } } },
});
