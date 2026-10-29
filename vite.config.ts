import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages + custom domain seo.kluzar.com serves at the root, so base is '/'.
// If this were served at username.github.io/seo (no custom domain), base would
// have to be '/seo/' — that is NOT the case for seo.kluzar.com, do not change
// this to '/seo/' without also changing the deployment to a subpath.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    // Local dev only: the Vite dev server proxies /api to a local Worker
    // (wrangler dev --local, default port 8787). Production uses
    // VITE_WORKER_URL instead, never a relative /api path, because the
    // Worker lives on a different origin than GitHub Pages.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
