import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest-setup.ts',
    alias: {
      '@': path.resolve(__dirname, './src')
    },
    server: {
      deps: {
        // next-intl's ESM imports `next/navigation` without an extension,
        // which Node's resolver refuses; let Vite resolve it instead.
        inline: ['next-intl'],
      },
    },
  }
})
