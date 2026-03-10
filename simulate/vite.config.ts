import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import { runtimeDir } from 'nitro/meta'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: 'app',
      router: {
        routesDirectory: 'routes',
        generatedRouteTree: 'routeTree.gen.ts',
        autoCodeSplitting: true,
      },
    }),
    react(),
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    nitro({
      preset: 'bun',
      renderer: {
        handler: resolve(runtimeDir, 'internal/vite/ssr-renderer'),
      },
      scanDirs: ['server'],
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  server: { port: 5174 },
})
