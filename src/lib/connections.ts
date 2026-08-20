// Live connection state for the integrations on the Connections page.
//
// The provider list in providers.ts is a CATALOG — what the app could talk to,
// and it ships the same to every store. This is the other half: what THIS store
// has actually connected, when it last synced, and what went wrong if anything
// did. The catalog's `connected: false` is a placeholder and always was.
//
// ── The one rule that shapes this file ────────────────────────────────────────
//
// The access token never touches the device. Not here, not in localStorage, not
// in a hidden field. A token in a browser is a token in every browser that
// device is ever signed into, it rides along in any export or backup, and it
// cannot be revoked from the app's side once it leaks.
//
// So the handshake is: the app sends you to the provider, you grant permission,
// the provider hands the code to OUR SERVER, and the server keeps the token.
// What comes back to the device is only what's in `Connection` below — a
// status, a timestamp, and the scopes you granted. Everything readable here is
// safe to sit in a browser, which is the test each field has to pass.
//
// That is why this cannot be finished before the backend exists: there is no
// server yet to hand the token to. The state model can be built now so the
// backend is built with somewhere to put it, rather than retrofitted after.
import { load, save } from './store'
import { useScope } from './scope'

export type ConnStatus =
  /** Never connected, or disconnected on purpose. */
  | 'off'
  /** Sent to the provider, waiting for them to hand the server a token. */
  | 'pending'
  /** Server holds a working token. */
  | 'on'
  /** Server holds a token that stopped working — expired, or access revoked. */
  | 'broken'

export interface Connection {
  /** Provider id from the catalog, e.g. 'toast', 'floor-logic'. */
  id: string
  status: ConnStatus
  /** When permission was granted. ISO. */
  since?: string
  /** Last successful pull. ISO. Absent means connected but never synced. */
  lastSync?: string
  /** What the provider said when it last failed — shown, not swallowed. */
  error?: string
  /**
   * What you actually granted, as the provider named it.
   *
   * Kept so the app can say "this can read your schedule" rather than "this is
   * connected", and so a scope that gets added later is visibly NOT granted
   * instead of silently missing.
   */
  scopes?: string[]
}

const key = (): string => {
  const s = useScope.getState()
  // Per store: Flowood's Toast is not Pearl's Toast, and one being connected
  // says nothing about the other.
  return `${s.currentConcept}|${s.currentLocation}::connections`
}

export function getConnections(): Record<string, Connection> {
  const r = load<Record<string, Connection>>(key(), {})
  return r && typeof r === 'object' ? r : {}
}

export const connectionFor = (id: string): Connection =>
  getConnections()[id] ?? { id, status: 'off' }

export function setConnection(id: string, patch: Partial<Connection>): Connection {
  const all = getConnections()
  const next: Connection = { ...(all[id] ?? { id, status: 'off' }), ...patch, id }
  save(key(), { ...all, [id]: next })
  return next
}

/** Forget a connection here. The server still has to revoke its own token. */
export function disconnect(id: string): void {
  const all = getConnections()
  delete all[id]
  save(key(), all)
}

/** Reading, for the badge on each provider card. */
export const STATUS_LABEL: Record<ConnStatus, string> = {
  off: 'Not connected',
  pending: 'Waiting for permission',
  on: 'Connected',
  broken: 'Needs reconnecting',
}

/**
 * How far along the permission handshake this app actually is.
 *
 * Honest by design: with no backend there is nowhere for a token to land, so
 * "Connect" cannot do anything real yet and the button must say so rather than
 * open a window that goes nowhere. `supabaseEnabled` is the same env flag the
 * offline write queue reads.
 */
export function connectReadiness(): { ready: boolean; why: string } {
  const backend = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )
  if (!backend)
    return {
      ready: false,
      why: 'Needs the backend first — there’s nowhere yet for the provider to hand the key, and it must never be kept on this device.',
    }
  return { ready: true, why: '' }
}
