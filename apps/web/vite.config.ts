import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
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
