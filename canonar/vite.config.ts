import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// проект — подпапка: /kainrax/canonar/
export default defineConfig({
  plugins: [react()],
  base: '/kainrax/canonar/'
})
