/// <reference types="vitest" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In docker-compose the backend is reachable as http://backend:8000
const apiTarget = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // file events from a Windows/macOS host don't reach a Docker container
    watch: { usePolling: process.env.VITE_USE_POLLING === '1' },
    proxy: {
      '/api': apiTarget,
      '/admin': apiTarget,
      '/static': apiTarget,
    },
  },
  test: {
    environment: 'node',
  },
})
