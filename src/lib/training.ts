// The training programmes — the five-day layout, as app content you can edit.
//
// The packets arrive as scanned pages: a five-day grid rotated sideways, a
// column per day. That reads on a laminated sheet in an office and it does not
// read on a phone in a kitchen — you'd be pinching and rotating to find one
// line. So the content is pulled out and laid out the app's way.
//
// ── Why it's editable ─────────────────────────────────────────────────────────
//
// Because standards move and menus roll over. Day Four's menu focus is "wraps,
// plates, pastas, Mini Mugs" today and won't be after the next rollout, and a
// training day that names dishes you no longer sell teaches a new hire the
// wrong menu. Shipping this as a fixed list would mean a code change every time
// the menu did, which is the same as it never getting changed.
//
// So the JSON below is a SEED. The store's own copy is what renders, saved per
// location like the sidework sheet, and new programmes the app ships are merged
// into it rather than replacing it.
import SEED from '../data/training-programs.json'
import { load, save } from './store'
import { useScope } from './scope'

export interface TrainingDay {
  day: string
  /** Which side of the job that day is on, where a programme spans two. */
  covers?: string
  /** The menu test set for that day, if there is one. */
  test?: string
  /** The section of the menu being learned that day. */
  focus?: string
  items: string[]
}
export interface Program {
  id: string
  title: string
  group: string
  what: string
  days: TrainingDay[]
}
export type Programs = Record<string, Omit<Program, 'id'>>

export const SEED_PROGRAMS = SEED as Programs

const key = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::training:programs`
}

/**
 * The store's programmes, with anything newly shipped merged in.
 *
 * Merge, never replace: a programme this store has edited keeps its edits, and
 * one the app has added since — a new station, say — still turns up. Same trap
 * the sidework sheet has, for the same reason: the copy is seeded once per
 * device and then belongs to that device.
 */
export function getPrograms(): Programs {
  const mine = load<Programs>(key(), {})
  const has = mine && typeof mine === 'object' ? mine : {}
  const missing = Object.keys(SEED_PROGRAMS).filter((id) => !has[id])
  if (missing.length === 0) return has
  const next = { ...has }
  for (const id of missing) next[id] = SEED_PROGRAMS[id]
  save(key(), next)
  return next
}

export function setPrograms(p: Programs): void {
  save(key(), p)
}

export const toList = (p: Programs): Program[] =>
  Object.entries(p).map(([id, v]) => ({ id, ...v }))

/** In the order they should read, with anything new falling in at the end. */
export function programGroups(list: Program[]): string[] {
  const order = ['Front of house', 'Kitchen stations', 'Bar', 'Management']
  const present = [...new Set(list.map((p) => p.group))]
  return [...order.filter((g) => present.includes(g)), ...present.filter((g) => !order.includes(g))]
}

/** The groups a new or edited programme can be filed under. */
export const GROUPS = ['Front of house', 'Kitchen stations', 'Bar', 'Management'] as const

/**
 * Who has done what.
 *
 * Per trainee, per store, and kept until someone clears it — a training record
 * isn't a checklist that resets overnight, it's the reason you can say a person
 * was signed off on Day Three.
 *
 * Ticks are keyed by the item's TEXT, not its position, so editing a day's list
 * doesn't silently re-point someone's completed items at different lines.
 */
const progressKey = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::training:progress`
}
type Progress = Record<string, Record<string, boolean>>

export const getProgress = (): Progress => {
  const r = load<Progress>(progressKey(), {})
  return r && typeof r === 'object' ? r : {}
}

/** A short stable hash of the item text, so the key doesn't hold a paragraph. */
function stamp(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
export const tickId = (program: string, day: string, text: string): string =>
  `${program}|${day}|${stamp(text)}`

export function setTick(who: string, id: string, on: boolean): Progress {
  const all = getProgress()
  const mine = { ...(all[who] ?? {}) }
  if (on) mine[id] = true
  else delete mine[id]
  const next = { ...all, [who]: mine }
  save(progressKey(), next)
  return next
}

/** Everyone who has any training ticked, so the picker can offer them back. */
export const trainees = (): string[] =>
  Object.keys(getProgress()).sort((a, b) => a.localeCompare(b))
