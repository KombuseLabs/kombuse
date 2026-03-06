import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SENTRY_RELEASE__: JSON.stringify(`web@${pkg.version}`),
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: 'philipplgh',
      project: 'web',
    }),
  ],
  base: '/',
  build: {
    sourcemap: 'hidden',
  },
})
