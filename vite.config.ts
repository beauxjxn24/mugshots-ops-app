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
        id: '/',
        name: 'The Pass',
        short_name: 'The Pass',
        description: 'Restaurant daily ops — sales, labor, ordering, prep and checklists, all in one place.',
        theme_color: '#070b13',
        background_color: '#070b13',
        display: 'standalone',
        orientation: 'any',
        scope: './',
        start_url: './',
        lang: 'en-US',
        dir: 'ltr',
        // App-store category hints (Play Store / PWABuilder read these).
        categories: ['business', 'productivity', 'food'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Store listings require at least one screenshot; a "wide" one lists the
        // app under desktop/Chrome, a "narrow" one under phones.
        screenshots: [
          { src: 'screenshot-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Dashboard on desktop' },
          { src: 'screenshot-phone.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Imports on a phone' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The OCR engine (~9MB) loads on demand — don't precache it.
        globIgnores: ['tesseract/**'],
        // Take control of already-open tabs the moment a new version activates
        // (skipWaiting alone activates it but leaves open pages on the old one).
        // Paired with the controllerchange reload in main.tsx, an open app now
        // refreshes itself on deploy instead of getting stuck on a stale build.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
})
