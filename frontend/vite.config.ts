import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      // Même origine que prod (nginx) : les fichiers formulaire sont sous /uploads sur le backend.
      '/uploads': 'http://localhost:4000',
    },
  },
})
