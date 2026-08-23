import { load, save } from './store'
import { useScope } from './scope'

/** One ordered line off a ticket — what was bought, and how many. */
export interface OrderItem {
  qty: number
  /** Exactly as the ticket prints it: "Savell Boxed Lunch". */
  name: string
  /** Unit price, for reconciling against the caterer total. */
  price?: number
  /** "Condiments on the side" — the thing that gets missed. */
  special?: string
}

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
  status?: 'confirmed' | 'tentative' | 'hold' // prototype status pills
  deposit?: number
  depositPaid?: boolean
  estimate?: number
  raw?: string // full ticket text from the import — the actual order
  /** What was actually ordered, line by line. */
  items?: OrderItem[]
  /** ezCater's "SETUP REQUIRED: Yes" — it changes who goes and what they take. */
  setup?: boolean
  /** Who to ask for on arrival, and their number. */
  contact?: string
  phone?: string
  /**
   * The original order PDF, kept in IndexedDB (see lib/docs). The extracted
   * `raw` text is what the app reads; this is what the kitchen prints, so the
   * printed copy is the caterer's own sheet rather than our reading of it.
   */
  docId?: string
}

/** Dining-room reservations — the prototype keeps these beside caterings. */
export interface Reservation {
  id: string
  name: string
  date: string
  time: string
  party: number
  notes: string
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
        // …and strip the DATE. The ticket is two columns and the OCR merges
        // them, so "HEADCOUNT" is followed by "Wednesday, August 19 20" — the
        // real count is the 20 on the end, and reading left to right hands you
        // the 19 out of the date. This ticket was read as nineteen guests.
        .replace(
          /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?/gi,
          ' ',
        )
        .replace(/\b(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)[a-z]*\.?,?/gi, ' ')
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
  // ezCater tickets put the CUSTOMER name on the line right after "Order #…"
  // (e.g. "Baptist Madison Rheumatology") — grab it directly, since many real
  // customer names don't contain the keywords the fallback scan looks for.
  const ordIdx = lines.findIndex((l) => /order\s*#/i.test(l))
  const afterOrder = ordIdx >= 0 ? (lines[ordIdx + 1] ?? '').trim() : ''
  const ezCompany =
    afterOrder && /[A-Za-z]{3,}/.test(afterOrder) && !/deliver|ezcater|support|^\(|^\d|^(mon|tue|wed|thu|fri|sat|sun)/i.test(afterOrder)
      ? afterOrder.slice(0, 50)
      : ''
  let company =
    labeled?.[1]?.trim() ||
    ezCompany ||
    lines.find((l) => /\b(llc|inc|school|church|corp|group|team|office|catering|center|centre|clinic|care|medical|dental|hospital|bank|university|academy|rheumatology|endocrine|orthopedic|pediatric|associates|partners|realty|insurance|law|firm)\b/i.test(l))?.slice(0, 50) ||
    ''
  // OCR merges the ticket's columns, so junk can trail the name ("… of
  // Mississippi as sate ap"). Names capitalize their words — cut at the
  // first run of two lowercase tokens.
  // The OCR runs the customer name straight into the store address on the same
  // visual row: "St Dominics Family and Internal Medicine 4245 Lakeland Dr".
  // A house number is where the name ends.
  company = company.replace(/\s+\d{2,6}\s+[A-Z][a-z]+.*$/, '').trim()
  const toks = company.split(/\s+/)
  for (let i = 1; i < toks.length; i++) {
    if (/^[a-z]/.test(toks[i - 1]) && /^[a-z]/.test(toks[i])) {
      company = toks.slice(0, i - 1).join(' ')
      break
    }
  }
  const event = /ezcater/i.test(text)
    ? `ezCater${orderNo ? ` #${orderNo[1]}` : ''}${company ? ` · ${company}` : ''}`
    : company || fileName.replace(/\.[^.]+$/, '') || 'Catering order'

  const source = /ezcater/i.test(text) ? 'ezCater' : undefined
  const items = parseItems(text)
  // The caterer's take, not the guest's total — the ticket prints both and
  // only one of them is money this store sees.
  const due = text.match(/caterer\s*total\s*due\s*\$?\s*([\d,]+(?:\.\d{2})?)/i)
  const total = text.match(/(?:^|\n)\s*total\s*\$?\s*([\d,]+(?:\.\d{2})?)/i)
  const money = due?.[1] ?? total?.[1]
  // "SETUP REQUIRED" and its Yes land on different lines once the ticket's two
  // columns are flattened, so the window has to be wide enough to cross one.
  const setup = /setup\s*required[\s\S]{0,140}?\byes\b/i.test(text)
  // The customer's number, not ezCater's help desk — the support line is
  // printed at the top of every ticket and would win a first-match race.
  const phone = [...text.matchAll(/\b(?:1-)?(\d{3})-(\d{3})-(\d{4})\b/g)]
    .map((m) => ({ area: m[1], num: `${m[1]}-${m[2]}-${m[3]}` }))
    .find((x) => !/^(800|833|844|855|866|877|888)$/.test(x.area))
  // Everything worth reading at a glance, as the notes line the log shows.
  const notes = [
    source ? 'Imported from ezCater PDF' : '',
    setup ? 'SETUP REQUIRED' : '',
    phone ? `Call ${phone.num}` : '',
    ...items.map((i) => `${i.qty}× ${i.name}`),
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    event: event.trim(),
    date,
    time,
    guests,
    notes,
    source,
    orderNo: orderNo?.[1],
    items: items.length ? items : undefined,
    setup: setup || undefined,
    phone: phone?.num,
    estimate: money ? parseFloat(money.replace(/,/g, '')) : undefined,
  }
}

/**
 * The ordered lines off an ezCater ticket.
 *
 * ezCater prints each one as a quantity on its own line, then the item and its
 * unit price — "7\nSavell Boxed Lunch @ $13.99" — with the description,
 * packaging and any special instructions underneath before the line total.
 *
 * This is the part that matters most and the part nothing was reading. Without
 * it a booking says twenty guests and nothing about what they ordered, so the
 * kitchen still has to open the PDF, and the prep sheet can't know a thing.
 */
export function parseItems(text: string): OrderItem[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const out: OrderItem[] = []

  for (let i = 0; i < lines.length; i++) {
    // "Savell Boxed Lunch @ $13.99" — the unit price is what marks an item
    // line rather than a description that happens to name a dish.
    const m = lines[i].match(/^(.{2,80}?)\s*@\s*\$\s*([\d,]+(?:\.\d{2})?)\s*$/)
    if (!m) continue
    const name = m[1].trim()
    // OCR leaves stubs behind — the tea line repeats as "1 ; @ $11.00" — so a
    // name has to actually be a name.
    if ((name.match(/[A-Za-z]/g) ?? []).length < 3) continue
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) continue
    const price = parseFloat(m[2].replace(/,/g, ''))

    // The quantity, two ways.
    //
    // On a clean text layer ezCater puts it alone on the line above. On an
    // OCR'd one the QTY column gets swallowed by the description — the real
    // ticket reads "7 bun), condiments, chips, and a cookie. $97.93" — so
    // there is nothing to find where it ought to be.
    //
    // The line total is, and it divides. $97.93 / $13.99 is exactly 7, and
    // that is arithmetic rather than a guess about layout. Only trusted when
    // it lands on a whole number; a near miss means the wrong total was
    // picked up, and no quantity beats an invented one.
    let qty = parseInt((lines[i - 1] ?? '').match(/^(\d{1,4})$/)?.[1] ?? '0', 10)
    let special = ''
    for (let j = i + 1; j < Math.min(i + 14, lines.length); j++) {
      const l = lines[j]
      if (/^\s*(sub\s*total|total|delivery fee|tip|sales tax)\b/i.test(l)) break
      if (/@\s*\$/.test(l) && j > i + 1) break
      if (!qty && price > 0) {
        for (const t of l.matchAll(/\$\s*([\d,]+\.\d{2})/g)) {
          const line = parseFloat(t[1].replace(/,/g, ''))
          const n = line / price
          if (n >= 1 && n <= 999 && Math.abs(n - Math.round(n)) < 0.02) {
            qty = Math.round(n)
            break
          }
        }
      }
      const sm = l.match(/^special\s+instructions:\s*(.*)$/i)
      if (sm) special = (sm[1] || lines[j + 1] || '').trim()
    }
    if (!qty) continue
    out.push({ qty, name, price, ...(special ? { special } : {}) })
  }
  return out
}


function pad(n: string): string {
  return String(n).padStart(2, '0')
}

/** "Tue, Aug 26" — the log's date column and the printed order both read this. */
export function fmtDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "6:30p" — short enough for a table cell. */
export function fmtTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'p' : 'a'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${ap}`
}
