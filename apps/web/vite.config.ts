import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The UI dev server sits one port above the control plane (PORT, as for `pnpm start`).
const port = Number(process.env['PORT'] ?? 4310);
const control = `http://127.0.0.1:${port}`;
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: port + 1,
    strictPort: true,
    proxy: {
      '/api': {
        target: control,
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (request) => {
            request.setHeader('origin', control);
          });
        },
      },
      '/health': { target: control, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1100 },
});
