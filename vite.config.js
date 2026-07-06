import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: `base` must match your GitHub repo name.
// Repo named "trade-journal" → base '/trade-journal/'.
// If you name the repo differently, change this line.
export default defineConfig({
  plugins: [react()],
  base: '/trade-journal/',
})
