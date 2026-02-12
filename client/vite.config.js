import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Build dentro del backend (compat incremental): /public/app
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: path.resolve(__dirname, '../public/app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Evita CORS en dev: React llama a /api/* y Vite proxy lo manda al Express
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
