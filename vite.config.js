import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    maxHeaderSize: 65536,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true,
      },
      '/sentinel-api': {
        target: 'http://127.0.0.1:3344',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sentinel-api/, ''),
      },
      '/sentinel-ws': {
        target: 'ws://127.0.0.1:3344',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sentinel-ws/, ''),
      }
    }
  }
})

