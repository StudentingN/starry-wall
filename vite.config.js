import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    host: '127.0.0.1', port: 4173, strictPort: true,
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem,key}', '**/.git/**', '**/package.json', '**/package-lock.json'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
});
