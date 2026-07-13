import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// State-of-the-art 2026 stack: React 19 + Vite + Tailwind v4 + installable PWA.
export default defineConfig({
  base: './',
  define: {
    __BUILD_DATE__: JSON.stringify(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // main.tsx registers explicitly (immediate + periodic checks)
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Mugshots Ops',
        short_name: 'Mugshots',
        description: 'Daily operations for Mugshots Grill & Bar',
        theme_color: '#1C2740',
        background_color: '#EBE3D6',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
})
