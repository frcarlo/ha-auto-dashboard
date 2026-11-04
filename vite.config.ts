import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

export default defineConfig({
  define: { __VERSION__: JSON.stringify(version) },
  // Lets a browser on this machine import the bundle into a running HA page while developing
  preview: { cors: true },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'auto-dashboard.js',
    },
    outDir: 'dist',
    target: 'es2022',
    minify: true,
    rollupOptions: {
      output: { inlineDynamicImports: true, minify: true },
    },
  },
})
