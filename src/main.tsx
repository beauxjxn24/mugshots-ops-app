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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
