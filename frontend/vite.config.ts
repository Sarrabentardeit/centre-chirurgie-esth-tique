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
    transformIndexHtml(html) {
      return html
        .replace(/%APP_BUILD_ID%/g, APP_BUILD_ID)
        .replace(
          '</head>',
          `<!-- build:${APP_BUILD_ID} -->
    <meta name="app-build-id" content="${APP_BUILD_ID}" />
    <script>
      (function () {
        try {
          if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
          var meta = document.querySelector('meta[name="app-build-id"]');
          var current = meta && meta.getAttribute('content');
          if (!current || current.indexOf('%') === 0) return;
          fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
              if (!d || !d.version || d.version === current) return;
              var u = new URL(location.href);
              if (u.searchParams.get('_v') === d.version) return;
              try { localStorage.setItem('app-build-id', d.version); } catch (e) {}
              u.searchParams.set('_v', d.version);
              location.replace(u.toString());
            })
            .catch(function () {});
        } catch (e) {}
      })();
    </script>
  </head>`,
        )
    },
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
