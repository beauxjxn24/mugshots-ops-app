import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { syncState, flush } from '../lib/outbox'

/**
 * Whether what you just typed is safe.
 *
 * Somebody counting the walk-in loses signal, and the honest question in their
 * head is "did that save?". Without an answer they either type it again on the
 * way out or write it on their hand — and a count entered twice is worse than
 * one entered once.
 *
 * So it says so, plainly: it's on the device, it's going up when there's a
 * signal, and here's how many are waiting. Silent when there's nothing to
 * report, because a badge that's always lit stops being read.
 */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState(syncState)

  useEffect(() => {
    const tick = () => setS(syncState())
    window.addEventListener('mugops:sync', tick)
    window.addEventListener('online', tick)
    window.addEventListener('offline', tick)
    const id = setInterval(tick, 5_000)
    return () => {
      window.removeEventListener('mugops:sync', tick)
      window.removeEventListener('online', tick)
      window.removeEventListener('offline', tick)
      clearInterval(id)
    }
  }, [])

  // Nothing to say: no backend yet, or everything's up and there's a signal.
  if (!s.enabled) return null
  if (s.online && s.waiting === 0) return null

  const offline = !s.online
  const label = offline ? 'No signal' : `Sending ${s.waiting}`

  if (compact) {
    return (
      <span
        title={
          offline
            ? `Saved on this device. ${s.waiting} change${s.waiting === 1 ? '' : 's'} will go up when you're back in signal.`
            : `${s.waiting} change${s.waiting === 1 ? '' : 's'} going up now.`
        }
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
          offline ? 'bg-warn/20 text-warn' : 'bg-white/10 text-white/85'
        }`}
      >
        {offline ? <CloudOff size={12} /> : <RefreshCw size={12} className="animate-spin" />}
        {label}
      </span>
    )
  }

  return (
    <button
      onClick={() => void flush()}
      title="Try now"
      className={`mb-3 flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left ${
        offline ? 'bg-warn/15' : 'bg-white/[0.07]'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${offline ? 'text-warn' : 'text-white/70'}`}>
        {offline ? <CloudOff size={14} /> : <RefreshCw size={14} className="animate-spin" />}
      </span>
      <span className="min-w-0">
        <span className={`block text-xs font-bold ${offline ? 'text-warn' : 'text-white/85'}`}>{label}</span>
        <span className="block text-[10px] leading-tight text-white/50">
          {offline
            ? `Saved on this device. ${s.waiting} waiting to go up.`
            : `${s.waiting} change${s.waiting === 1 ? '' : 's'} on the way.`}
        </span>
      </span>
    </button>
  )
}
