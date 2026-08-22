// The training programmes — rebuilt as app content, not shown as paper.
//
// The packets arrive as scanned pages: a five-day grid rotated sideways, a
// Mugshots header, a column per day. That reads on a laminated sheet in an
// office and it does not read on a phone in a kitchen — you'd be pinching and
// rotating to find one line.
//
// So it goes the same way every other document sent here has gone: the content
// is pulled out and laid out the app's way. Which also makes it DO something —
// a training checklist you can tick, per trainee, instead of a picture of one.
import RAW from '../data/training-programs.json'
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

export const PROGRAMS: Program[] = Object.entries(
  RAW as Record<string, Omit<Program, 'id'>>,
).map(([id, p]) => ({ id, ...p }))

export const programById = (id: string): Program | undefined => PROGRAMS.find((p) => p.id === id)

/** In the order they should read, with anything new falling in at the end. */
export function programGroups(): string[] {
  const order = ['Front of house', 'Kitchen stations', 'Bar', 'Management']
  const present = [...new Set(PROGRAMS.map((p) => p.group))]
  return [...order.filter((g) => present.includes(g)), ...present.filter((g) => !order.includes(g))]
}

/**
 * Who has done what.
 *
 * Per trainee, per store, and kept until someone clears it — a training record
 * isn't a checklist that resets overnight, it's the reason you can say a person
 * was signed off on Day Three.
 */
const key = (): string => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::training:progress`
}
type Progress = Record<string, Record<string, boolean>>

export const getProgress = (): Progress => {
  const r = load<Progress>(key(), {})
  return r && typeof r === 'object' ? r : {}
}
/** One tick: which trainee, which programme, which day, which line. */
export const tickId = (program: string, day: string, i: number): string => `${program}|${day}|${i}`

export function setTick(who: string, id: string, on: boolean): Progress {
  const all = getProgress()
  const mine = { ...(all[who] ?? {}) }
  if (on) mine[id] = true
  else delete mine[id]
  const next = { ...all, [who]: mine }
  save(key(), next)
  return next
}

/** Everyone who has any training ticked, so the picker can offer them back. */
export const trainees = (): string[] => Object.keys(getProgress()).sort((a, b) => a.localeCompare(b))
