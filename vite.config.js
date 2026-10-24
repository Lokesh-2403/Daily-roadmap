
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'public',
  publicDir: false,
  server: {
    host: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
