// Who is actually in the building tonight.
//
// Tipshare already knows: a shift's pool is split between the servers who rang
// sales and the bartenders, hosts and expos who get tipped out, and all of
// them are named on that sheet before anyone starts side work. So the sidework
// pickers ask Tipshare rather than the roster — four names to choose from
// instead of sixty-six, and none of them people who are off tonight.

/** The shape Tipshare keeps for the shift in progress (`tips:live`). */
export interface TipsLive {
  date: string
  meal: 'AM' | 'PM'
  servers: Array<{ id: string; name: string; amount: number }>
  entries: Array<{ id: string; name: string; role: 'Bar' | 'Expo' | 'Host'; hours: number }>
}

export const EMPTY_TIPS_LIVE: TipsLive = { date: '', meal: 'AM', servers: [], entries: [] }

/** Which Tipshare bucket a duty sheet's role draws from. */
const BUCKET: Record<string, 'servers' | 'Bar' | 'Host' | 'Expo'> = {
  Server: 'servers',
  Bar: 'Bar',
  Host: 'Host',
  Expo: 'Expo',
}

/**
 * The names on tonight's Tipshare sheet for one duty-sheet role, in the order
 * they were added. Empty when Tipshare hasn't been started, or for a role it
 * doesn't track (To-Go, and every kitchen station) — callers fall back to the
 * roster so the picker is never empty.
 */
export function tonightsCrew(live: TipsLive | null | undefined, role: string): string[] {
  const bucket = BUCKET[role]
  if (!live || !bucket) return []
  const names =
    bucket === 'servers'
      ? (live.servers ?? []).map((s) => s?.name)
      : (live.entries ?? []).filter((e) => e?.role === bucket).map((e) => e?.name)
  const out: string[] = []
  for (const n of names) {
    const name = (n ?? '').trim()
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name)
  }
  return out
}
