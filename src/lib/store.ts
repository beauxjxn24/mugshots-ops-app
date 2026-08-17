import { useCallback, useEffect, useRef, useState } from 'react'
import { useScopeKey } from './scope'
import { queue } from './outbox'

/**
 * Safe, namespaced device storage. Every read is guarded (a corrupt or
 * unparseable value falls back to the default instead of throwing), and every
 * write swallows quota / private-mode errors. This is the robustness the
 * original app lacked.
 */
const NS = 'mugops:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

export function save<T>(key: string, value: T): void {
  try {
    // The device is always written first. A count typed in the walk-in is safe
    // the instant it's typed, whether or not there's a signal to send it on —
    // the queue below carries it up when there is.
    localStorage.setItem(NS + key, JSON.stringify(value))
    queue(key)
    // Same-tab live update: the browser's native `storage` event only fires in
    // OTHER tabs, so a component that writes here (an importer) would never
    // notify the Dashboard / Nightly pages mounted in the SAME tab — they'd sit
    // on stale numbers until a manual reload ("dashboard didn't update"). This
    // custom event closes that gap: every usePersistentState hook on this key
    // refreshes the moment anything writes it.
    try {
      window.dispatchEvent(new CustomEvent('mugops:save', { detail: key }))
    } catch {
      /* no window (SSR / worker) — nothing to notify */
    }
  } catch {
    /* quota exceeded / storage disabled — fail quietly */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(NS + key)
  } catch {
    /* ignore */
  }
}

// One-time cleanup: wipe the seeded SAMPLE data (ordering guides, inventory
// counts, staff) from existing installs so everyone starts clean. Real content
// (recipes, sidework, checklists, stores, and anything you enter) is untouched.
// Bump CLEAN_VERSION to trigger another targeted cleanup in the future.
const CLEAN_VERSION = '2026-07-13-clean'
try {
  if (localStorage.getItem(NS + '__clean') !== CLEAN_VERSION) {
    Object.keys(localStorage).forEach((k) => {
      if (!k.startsWith(NS)) return
      if (/::ordering:data$/.test(k) || /::staff:list$/.test(k) || /::inv:/.test(k)) {
        localStorage.removeItem(k)
      }
    })
    localStorage.setItem(NS + '__clean', CLEAN_VERSION)
  }
} catch {
  /* storage unavailable — nothing to clean */
}

/**
 * React state that persists to device storage under `key`, namespaced to the
 * currently-selected concept + location. Switching stores swaps in that store's
 * data automatically; each location keeps its own counts, checklists, etc.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const scope = useScopeKey()
  const fullKey = `${scope}::${key}`
  const [state, setState] = useState<T>(() => load(fullKey, initial))
  const keyRef = useRef(fullKey)

  // On store switch, load the new store's value for this key.
  useEffect(() => {
    if (keyRef.current !== fullKey) {
      keyRef.current = fullKey
      setState(load(fullKey, initial))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey])

  // Persist under whichever key currently matches the state.
  useEffect(() => {
    save(keyRef.current, state)
  }, [state])

  // Keep multiple open tabs / windows in sync (same store only).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === NS + fullKey && e.newValue != null) {
        try {
          setState(JSON.parse(e.newValue))
        } catch {
          /* ignore malformed cross-tab payloads */
        }
      }
    }
    // Same-tab writes (an importer updating nightly:log while this page is open)
    // — reload from storage so the screen reflects the new data immediately.
    const onLocal = (e: Event) => {
      if ((e as CustomEvent).detail !== fullKey) return
      const fresh = load<T>(fullKey, initial)
      // Only re-render when the value actually changed (also breaks the loop
      // where this hook's own write echoes back its own event).
      setState((prev) => (JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh))
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('mugops:save', onLocal)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('mugops:save', onLocal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey])

  const reset = useCallback(() => setState(initial), [initial])
  return [state, setState, reset] as const
}

/** Today as an ISO date (YYYY-MM-DD), local time. */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}
