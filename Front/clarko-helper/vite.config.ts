import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Open the editor in the default browser when `npm run dev` starts.
    open: true,
    // The API only accepts requests from http://localhost:5173 (Cors:AllowedOrigins), so don't drift to another port.
    port: 5173,
    strictPort: true,
  },
})
