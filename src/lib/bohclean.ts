// The BOH deep-clean schedule — the two laminated sheets on the kitchen wall.
//
// Weekly: an AM job and a PM job for every day, done every shift. Monthly: a
// bigger job on a numbered Sunday — ice machine on the 1st, flour bins on the
// 2nd, speed racks on the 3rd, ceiling tiles on the 4th.
//
// ── What the app does that the laminate can't ─────────────────────────────────
//
// It knows what day it is. On the wall you find today's column on one sheet,
// then remember there's a second sheet, then work out on a calendar which
// Sunday of the month this is. Three steps, all of them skippable, and the one
// people skip is the second sheet — which is where the ice machine lives.
//
// Here today's line is just what's on the screen, with the monthly job stacked
// on top of it when the date says so.
import SEED from '../data/boh-cleaning.json'
import { load, save } from './store'
import { useScope } from './scope'

export interface CleanDay {
  AM?: string[]
  PM?: string[]
  /** A day's own aside, where it has one. */
  note?: string
}
export interface MonthlyClean extends CleanDay {
  /** What the job is, so a Sunday reads as "Ice machine" before you read the steps. */
  title?: string
}
export interface CleanSchedule {
  /** Monday-first, seven entries — same order as the prep sheet and BAR_WEEKLY. */
  weekly: CleanDay[]
  /** Four entries: the 1st through 4th Sunday of the month. */
  monthly: MonthlyClean[]
  /** The schedule's own standing note, printed under every day. */
  note?: string
}

export const SEED_CLEAN = SEED as CleanSchedule

const key = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::boh:cleaning`
}

/**
 * This store's schedule, with any gap filled from the shipped one.
 *
 * Editable for the same reason the closer duties are: kitchens differ, and a
 * schedule that needs a code change every time a standard moves is one that
 * stops matching the wall within a month. Slot-by-slot fill rather than
 * all-or-nothing, so a store that has edited Tuesday still picks up a day the
 * app adds later.
 */
/**
 * One shift's jobs, whatever shape they were stored in.
 *
 * The first version of this file held ONE string per shift, because the
 * laminated sheet has one line per box. The second BOH document has three or
 * four, so a shift is a list now — and any device that saved the old shape has
 * a bare string sitting in storage that would blow up the moment it was mapped
 * over.
 */
const lines = (v: unknown): string[] | undefined => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x.trim())
  if (typeof v === 'string' && v.trim()) return [v]
  return undefined
}
const fold = <T extends CleanDay>(seed: T, saved: unknown): T => {
  if (!saved || typeof saved !== 'object') return seed
  const s = saved as Record<string, unknown>
  return {
    ...seed,
    ...s,
    AM: lines(s.AM) ?? seed.AM,
    PM: lines(s.PM) ?? seed.PM,
  } as T
}

export function getSchedule(): CleanSchedule {
  const raw = load<Partial<CleanSchedule> | null>(key(), null)
  const mine = raw && typeof raw === 'object' ? raw : {}
  const weekly = SEED_CLEAN.weekly.map((d, i) =>
    fold(d, Array.isArray(mine.weekly) ? mine.weekly[i] : undefined),
  )
  const monthly = SEED_CLEAN.monthly.map((d, i) =>
    fold(d, Array.isArray(mine.monthly) ? mine.monthly[i] : undefined),
  )
  return { weekly, monthly, note: typeof mine.note === 'string' ? mine.note : SEED_CLEAN.note }
}

export const setSchedule = (s: CleanSchedule): void => save(key(), s)

/** Put a store's copy back to the sheet the app ships. */
export const resetSchedule = (): void => save(key(), null)

/**
 * Which Sunday of the month a date is — 1 through 5, or 0 when it isn't Sunday.
 *
 * The counting job nobody wants to do standing at a wall, and the one place
 * this is worth getting exactly right: it's what decides whether the ice
 * machine gets pulled apart today.
 */
export function nthSunday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getDay() !== 0) return 0
  return Math.floor((d - 1) / 7) + 1
}

/** Monday-first index, matching `weekly`. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

export interface DueToday {
  weekday: number
  weekly: CleanDay
  /** The numbered Sunday, 0 when today isn't one. */
  nth: number
  /**
   * The monthly job, when today is a Sunday that has one.
   *
   * A fifth Sunday has none — the sheet only goes to four. That's a real answer
   * and the screen says it, rather than showing an empty space that reads like
   * something failed to load.
   */
  monthly?: MonthlyClean
}

export function dueOn(iso: string, s: CleanSchedule = getSchedule()): DueToday {
  const weekday = weekdayIndex(iso)
  const nth = nthSunday(iso)
  return {
    weekday,
    weekly: s.weekly[weekday] ?? {},
    nth,
    monthly: nth >= 1 && nth <= s.monthly.length ? s.monthly[nth - 1] : undefined,
  }
}

export const DOW_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th']

/** A stable tick key — by TEXT, so editing a line doesn't re-point a sign-off. */
export function cleanTickId(scope: 'w' | 'm', slot: 'AM' | 'PM', text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `clean|${scope}|${slot}|${(h >>> 0).toString(36)}`
}
