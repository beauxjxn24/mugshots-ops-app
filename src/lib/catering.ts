import { load, save } from './store'
import { useScope } from './scope'

export interface Booking {
  id: string
  event: string
  date: string // YYYY-MM-DD
  time: string // HH:MM (24h)
  guests: number
  notes: string
  source?: string // e.g. 'ezCater'
  orderNo?: string // ezCater order # — imports de-dupe on this
  completedAt?: string // set when the event is marked done (Completed events log)
}

function scopedKey(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::catering:bookings`
}
export const getBookings = (): Booking[] => load(scopedKey(), [])
export const setBookings = (b: Booking[]): void => save(scopedKey(), b)

/**
 * Add a booking; imports de-dupe by ezCater order # (handoff spec) so
 * re-dropping the same export skips orders already on the log.
 */
export function addBooking(b: Booking): 'added' | 'duplicate' {
  const existing = getBookings()
  if (b.orderNo && existing.some((x) => x.orderNo === b.orderNo)) return 'duplicate'
  setBookings([...existing, b])
  return 'added'
}

/** Real import-status badge: last catering import (file + time). */
export interface LastImport {
  file: string
  at: string
}
const lastKey = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::catering:lastImport`
}
export const getLastCateringImport = (): LastImport | null => load(lastKey(), null)
export const recordCateringImport = (file: string): void =>
  save(lastKey(), { file, at: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })

/** Heuristic: does this text look like a catering / ezCater order? */
export function isCateringDoc(text: string): boolean {
  return /\b(ezcater|catering|caterer|headcount|head count|guest count|delivery (date|time)|event date|# of (guests|people))\b/i.test(
    text,
  )
}

const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')

/** Best-effort pull of the order's date, time, headcount, and a title. */
export function parseCatering(text: string, fileName = ''): Omit<Booking, 'id'> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // Date: try ISO, US numeric, or "Month DD[, YYYY]" — ezCater tickets print
  // "Tuesday, August 11" with no year, so the year is optional and we assume
  // the next upcoming occurrence.
  let date = ''
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/)
  const named = text.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/)
  if (iso) {
    date = `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`
  } else if (us) {
    const yr = us[3].length === 2 ? `20${us[3]}` : us[3]
    date = `${yr}-${pad(us[1])}-${pad(us[2])}`
  } else {
    // Try every "Word DD" candidate until one is an actual month — street
    // addresses ("Jackson 4245") match the shape but aren't months.
    for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/g)) {
      const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
      if (mi < 0) continue
      let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear()
      if (!m[3]) {
        // No year on the ticket: if that month/day passed more than 60 days
        // ago, it must mean next year.
        const candidate = new Date(year, mi, parseInt(m[2], 10))
        if (Date.now() - candidate.getTime() > 60 * 86400000) year++
      }
      date = `${year}-${pad(String(mi + 1))}-${pad(m[2])}`
      break
    }
  }

  // Time: "6:30 PM" / "18:30".
  let time = ''
  const t12 = text.match(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i)
  const t24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (t12) {
    let h = parseInt(t12[1], 10) % 12
    if (/p/i.test(t12[3])) h += 12
    time = `${pad(String(h))}:${t12[2]}`
  } else if (t24) {
    time = `${pad(t24[1])}:${t24[2]}`
  }

  // Headcount: "headcount 30", "30 guests", "# of people: 30". OCR of a
  // two-column ticket can wedge other text (even a delivery time) between the
  // label and the number, so scan a wider window and skip anything time-like.
  let guests = 0
  const g =
    text.match(/(?:head\s?count|guest count|# of (?:guests|people)|guests?|people|serves)\D{0,6}(\d{1,4})\b(?!:)/i) ||
    text.match(/(\d{1,4})\s*(?:guests|people|pax|servings)\b/i)
  if (g) {
    guests = parseInt(g[1], 10) || 0
  } else {
    const hc = text.match(/head\s?count([\s\S]{0,80})/i)
    if (hc) {
      const window = hc[1]
        .replace(/\d{1,2}:\d{2}(?:\s?[AP]\.?M\.?)?(?:\s+[A-Z]{2,4})?/gi, ' ') // strip times
        .replace(/\d{1,2}:\d{2}/g, ' ')
      const num = window.match(/\b(\d{1,4})\b/)
      if (num) guests = parseInt(num[1], 10) || 0
    }
  }

  // Title: prefer a labeled customer/company, then an order # (must contain a
  // digit), else the file name.
  const labeled = text.match(/(?:customer|contact|company|account|bill\s*to)\s*[:\-]\s*([^\n]{2,50})/i)
  // Order # must contain a digit — "#SETUP", "#DELIVERY" and other shouty
  // section headers match the shape but aren't order numbers.
  const orderNo =
    text.match(/order\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9][A-Z0-9-]{2,}\d[A-Z0-9-]*|[A-Z0-9-]*\d[A-Z0-9-]{2,})/i) ||
    text.match(/#\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/)
  const company =
    labeled?.[1]?.trim() ||
    lines.find((l) => /\b(llc|inc|school|church|corp|group|team|office|catering)\b/i.test(l))?.slice(0, 50) ||
    ''
  const event = /ezcater/i.test(text)
    ? `ezCater${orderNo ? ` #${orderNo[1]}` : ''}${company ? ` · ${company}` : ''}`
    : company || fileName.replace(/\.[^.]+$/, '') || 'Catering order'

  const source = /ezcater/i.test(text) ? 'ezCater' : undefined
  return {
    event: event.trim(),
    date,
    time,
    guests,
    notes: source ? 'Imported from ezCater PDF' : '',
    source,
    orderNo: orderNo?.[1],
  }
}

function pad(n: string): string {
  return String(n).padStart(2, '0')
}
