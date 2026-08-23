// The count that rides on a menu item.
//
// ── Why a badge at all ───────────────────────────────────────────────────────
//
// A weekly checklist resets on Monday whether or not anybody worked it. The one
// that never got touched isn't flagged, isn't carried and isn't mentioned — it
// just becomes a clean sheet on Monday morning, and you find out at the walk-in
// nobody defrosted. Nothing in the app ever said "this is about to expire
// unfinished", because nothing in the app was looking.
//
// ── Why it counts lists, not boxes ───────────────────────────────────────────
//
// "3" meaning three lists behind is a number somebody acts on. "47" meaning
// forty-seven unticked boxes across four lists is a number somebody learns to
// ignore by Thursday, and a badge nobody reads is worse than no badge — it
// trains the eye to skip that corner of the screen.
//
// ── Why only two of the four raise their voice ───────────────────────────────
//
// AM and PM are owed for the shift they belong to and everyone already knows
// it; a red pill on Tuesday's opening list at 9am is a complaint, not news. The
// weekly list is the one with a deadline you can miss quietly, so it's the one
// that escalates: open all week, amber with three days left, red with one. Two
// days is the threshold because that's the last point a manager can still put
// it on somebody's shift.
import { useMemo } from 'react'
import { useDue, badgeFrom, type Urgency } from '../lib/checkdue'
import type { Role } from '../lib/role'

export interface Badge {
  count: number
  tone: string
}

/** What each level looks like. `open` stays grey — it's information, not alarm. */
const TONE: Record<Urgency, string> = {
  clear: '',
  open: 'border-white/15 bg-white/10 text-white/70',
  soon: 'border-warn/40 bg-warn/20 text-warn',
  late: 'border-down/45 bg-down/25 text-down',
}

/**
 * Badges keyed by the route they sit on.
 *
 * Staff get none: Checklists is a manager's walk of the building and isn't even
 * in their menu, so a badge for it would be a number pointing at a door they
 * can't open.
 */
export function useNavBadges(role: Role): Record<string, Badge | undefined> {
  const due = useDue()
  return useMemo(() => {
    if (role === 'staff') return {}
    const { count, worst } = badgeFrom(due)
    if (count === 0) return {}
    return { '/checklists': { count, tone: TONE[worst] } }
  }, [due, role])
}

/**
 * Sum of the badges inside a rail area, for when that area is collapsed.
 *
 * The desktop rail shows one area open at a time, so a badge on Checklists is
 * invisible unless you happen to be standing in Daily Ops — which is precisely
 * the situation the badge exists to interrupt. The header carries it instead,
 * and the strongest tone in the area wins so a red child never softens to grey
 * on the way up.
 */
export function rollUp(routes: string[], badges: Record<string, Badge | undefined>): Badge | undefined {
  const hit = routes.map((r) => badges[r]).filter((b): b is Badge => !!b)
  if (hit.length === 0) return undefined
  const rank = (t: string): number => (t === TONE.late ? 3 : t === TONE.soon ? 2 : 1)
  const worst = hit.reduce((a, b) => (rank(b.tone) > rank(a.tone) ? b : a))
  return { count: hit.reduce((n, b) => n + b.count, 0), tone: worst.tone }
}

/** The pill itself. Tabular figures so a 1 and a 2 are the same width. */
export function NavBadge({ badge }: { badge?: Badge }) {
  if (!badge || badge.count === 0) return null
  return (
    <span
      // Pushed to the right edge of the row so every badge in the menu lines up
      // in one column instead of floating at the end of whatever label it's on.
      className={`ml-auto grid h-[17px] min-w-[17px] shrink-0 place-items-center rounded-full border px-1 text-[10px] font-bold tabular-nums ${badge.tone}`}
      aria-label={`${badge.count} ${badge.count === 1 ? 'list' : 'lists'} still due`}
    >
      {badge.count}
    </span>
  )
}
