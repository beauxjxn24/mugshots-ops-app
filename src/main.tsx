// Polyfills for brand-new JS APIs pdf.js's renderer uses — without these,
// PDF page rendering (and therefore OCR) dies on slightly older browsers.
/* eslint-disable @typescript-eslint/no-explicit-any */
if (!(Map.prototype as any).getOrInsertComputed) {
  ;(Map.prototype as any).getOrInsertComputed = function (key: unknown, fn: (k: unknown) => unknown) {
    if (!this.has(key)) this.set(key, fn(key))
    return this.get(key)
  }
}
if (!(Map.prototype as any).getOrInsert) {
  ;(Map.prototype as any).getOrInsert = function (key: unknown, value: unknown) {
    if (!this.has(key)) this.set(key, value)
    return this.get(key)
  }
}
if (!(Math as any).sumPrecise) {
  ;(Math as any).sumPrecise = (values: Iterable<number>) => {
    let sum = 0
    for (const v of values) sum += v
    return sum
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { seedFlowoodHistory } from './lib/nightly'
import { applyOwnerDrops } from './lib/ownerdata'
import { cleanupCatalogNames } from './lib/catalog'
import { seedCountSheet } from './lib/countsheet'

// Owner's real 21-day Flowood sales history (from the design handoff) loads
// once into an empty Flowood store — Forecast/Period/Dashboard light up day one.
// Best-effort boot migrations — a corrupt/legacy store must never stop the app
// from mounting. Each is isolated so one failure can't block the others.
const safeBoot = (label: string, fn: () => void) => {
  try {
    fn()
  } catch (e) {
    console.error(`boot step "${label}" skipped:`, e)
  }
}
safeBoot('seedFlowoodHistory', seedFlowoodHistory)
safeBoot('applyOwnerDrops', applyOwnerDrops)
safeBoot('cleanupCatalogNames', cleanupCatalogNames)
safeBoot('seedCountSheet', seedCountSheet)

// Keep installed copies fresh: grab new versions the moment they deploy,
// and keep checking every 5 minutes while the app stays open.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, reg) {
    if (!reg) return
    setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000)
  },
})

// When a freshly-installed service worker takes control, reload once so the
// running page swaps to the new assets instead of waiting for the next launch.
if ('serviceWorker' in navigator) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    location.reload()
  })
}

// Self-healing updater: if the server's index.html references a different JS
// bundle than the one running, the browser is serving a stale copy — wipe
// every cache + service worker and reload once. Ends "old version stuck"
// problems regardless of host or service-worker mood.
async function selfHeal() {
  try {
    const current = document.querySelector('script[src*="assets/"]')?.getAttribute('src')
    if (!current) return
    // Unique query param so the request DOESN'T match the service worker's
    // precached index.html — otherwise the SW serves the stale copy and this
    // check compares old-to-old and never detects a deploy. This is the bug
    // that made "the page won't update" stick.
    const res = await fetch(`./index.html?_fresh=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.text()
    const m = html.match(/src="?\.?\/?(assets\/[^"\s>]+\.js)/)
    if (!m) return
    const fresh = m[1]
    if (current.replace(/^\.?\//, '') !== fresh && !sessionStorage.getItem('__healed')) {
      sessionStorage.setItem('__healed', '1') // one reload per session — no loops
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      location.reload()
    }
  } catch {
    /* offline — nothing to heal */
  }
}
selfHeal()
setInterval(selfHeal, 60 * 1000)
// The moment you come back to the tab, check for a fresh version too —
// updates land on the next glance instead of the next timer tick.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') selfHeal()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
