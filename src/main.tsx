import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { App } from './App'
import { seedFlowoodHistory } from './lib/nightly'

// Owner's real 21-day Flowood sales history (from the design handoff) loads
// once into an empty Flowood store — Forecast/Period/Dashboard light up day one.
seedFlowoodHistory()

// Keep installed copies fresh: grab new versions the moment they deploy,
// and keep checking every 30 minutes while the app stays open.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, reg) {
    if (!reg) return
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
  },
})

// Self-healing updater: if the server's index.html references a different JS
// bundle than the one running, the browser is serving a stale copy — wipe
// every cache + service worker and reload once. Ends "old version stuck"
// problems regardless of host or service-worker mood.
async function selfHeal() {
  try {
    const current = document.querySelector('script[src*="assets/"]')?.getAttribute('src')
    if (!current) return
    const res = await fetch('./index.html', { cache: 'no-store' })
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
setInterval(selfHeal, 5 * 60 * 1000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
