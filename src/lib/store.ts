import { useCallback, useEffect, useRef, useState } from 'react'
import { useScopeKey } from './scope'

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
    localStorage.setItem(NS + key, JSON.stringify(value))
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
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
