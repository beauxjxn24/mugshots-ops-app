// Working with no signal.
//
// The walk-in has no wifi, the keg room has no wifi, and counting a cooler is
// exactly where somebody is standing when they type a number in. Everything
// this app does has to keep working with the bars greyed out, and nothing typed
// while offline may be lost.
//
// The device is always the first write. save() puts the value in local storage
// before anything else happens, so a count is safe the instant it's typed —
// offline, mid-flight, or with the router down. This queue is what carries that
// value up afterwards.
//
// What's queued is the KEY, not the value. Every write here replaces a whole
// blob, so the only version worth uploading is whatever the device holds when
// the connection comes back. A cook who fixes the same count five times in the
// walk-in sends one row, not five, and the queue can never carry a value that
// has since been corrected.
import { supabase, supabaseEnabled } from './supabase'

const QUEUE_KEY = 'mugops:__outbox'
const NS = 'mugops:'

/** Keys written on this device that the server hasn't taken yet. */
let pending = new Set<string>()
/** Set when a flush fails — the browser can claim to be online with no route out. */
let lastFailed = false
let flushing = false
let timer: ReturnType<typeof setTimeout> | null = null

function readQueue(): Set<string> {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr.filter((k) => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeQueue(): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...pending]))
  } catch {
    /* quota — the value itself is still saved, which is the part that matters */
  }
}

function announce(): void {
  try {
    window.dispatchEvent(new CustomEvent('mugops:sync'))
  } catch {
    /* no window */
  }
}

pending = readQueue()

export interface SyncState {
  /** Is a backend configured at all? Until it is, nothing is "unsynced". */
  enabled: boolean
  online: boolean
  /** How many keys are waiting to go up. */
  waiting: number
}

export const syncState = (): SyncState => ({
  enabled: supabaseEnabled,
  online: typeof navigator === 'undefined' ? true : navigator.onLine && !lastFailed,
  waiting: pending.size,
})

/**
 * Note that a key changed on this device.
 *
 * A no-op until a backend exists, so the app stays exactly as it is today and
 * never shows a device full of "waiting" writes with nowhere to send them.
 */
export function queue(fullKey: string): void {
  if (!supabaseEnabled) return
  if (fullKey.startsWith('__')) return // device-local: role, scope, unlock flags
  pending.add(fullKey)
  writeQueue()
  announce()
  schedule(400)
}

/** Try again in a moment — debounced, so a burst of typing sends once. */
function schedule(ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flush()
  }, ms)
}

/**
 * Send everything waiting.
 *
 * Each key goes up carrying the value the device holds right now. A key that
 * fails stays in the queue — losing a walk-in count to a dropped connection is
 * the one outcome this whole file exists to prevent — and the next attempt
 * backs off rather than hammering a dead connection from a phone on 2 bars.
 */
export async function flush(): Promise<void> {
  if (!supabaseEnabled || !supabase || flushing) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  if (pending.size === 0) return

  flushing = true
  const batch = [...pending]
  let failed = false

  for (const key of batch) {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(NS + key)
    } catch {
      /* unreadable — drop it rather than retry forever */
    }
    // Written and then deleted while offline: nothing to send, nothing to keep.
    if (raw == null) {
      pending.delete(key)
      continue
    }
    try {
      const { error } = await supabase
        .from('kv')
        .upsert({ key, value: JSON.parse(raw), updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error
      pending.delete(key)
    } catch {
      failed = true
      break // the connection is gone; the rest stay queued in order
    }
  }

  lastFailed = failed
  flushing = false
  writeQueue()
  announce()
  // Backing off rather than retrying flat out: a phone in a walk-in will fail
  // every attempt until somebody walks out of it.
  if (pending.size > 0) schedule(failed ? 30_000 : 1_000)
}

/** Start listening. Called once at boot. */
export function startSync(): void {
  if (!supabaseEnabled) return
  try {
    window.addEventListener('online', () => {
      lastFailed = false
      announce()
      schedule(0)
    })
    window.addEventListener('offline', announce)
    // Coming back to the app is the moment somebody has walked out of the
    // cooler, which is exactly when the queue should go.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule(0)
    })
    schedule(1_000)
  } catch {
    /* no window */
  }
}
