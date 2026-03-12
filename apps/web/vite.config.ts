import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import pkg from './package.json' with { type: 'json' }

const sentryPlugins = process.env.SENTRY_AUTH_TOKEN
  ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG ?? 'philipplgh',
        project: process.env.SENTRY_PROJECT ?? 'web',
      }),
    ]
  : [];

// https://vite.dev/config/
export default defineConfig({
  define: {
    __SENTRY_RELEASE__: JSON.stringify(`web@${pkg.version}`),
  },
  plugins: [
    react(),
    tsconfigPaths(),
    ...sentryPlugins,
  ],
  base: '/',
  build: {
    sourcemap: 'hidden',
  },
})
