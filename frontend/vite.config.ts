import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { writeFileSync, mkdirSync } from 'fs'

/** Identifiant unique par build — change à chaque `vite build` / déploiement. */
const APP_BUILD_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function emitVersionJson(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        path.join(outDir, 'version.json'),
        JSON.stringify({ version: APP_BUILD_ID, builtAt: new Date().toISOString() }),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
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
