import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true }, // exposes the dev server on the LAN so you can open it on a phone
})
