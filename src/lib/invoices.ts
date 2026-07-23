import { load, save } from './store'
import { useScope } from './scope'

export interface Invoice {
  id: string
  vendor: string
  date: string
  number: string
  total: number
  paid: boolean
  /** IndexedDB id of the imported PDF/photo this invoice came from. */
  docId?: string
}

function key(): string {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::invoices:list`
}
export const getInvoices = (): Invoice[] => load<Invoice[]>(key(), [])
export const setInvoices = (r: Invoice[]): void => save(key(), r)
export const addInvoice = (inv: Invoice): void => setInvoices([...getInvoices(), inv])

/** Guess vendor / total / number from an invoice's text. */
export function parseInvoice(text: string, fileName = ''): { vendor: string; total: number; number: string; date?: string } {
  const vendor = /us\s?foods/i.test(text)
    ? 'US Foods'
    : /gulf\s?coast/i.test(text)
      ? 'Gulf Coast Produce'
      : /sysco/i.test(text)
        ? 'Sysco'
        : /performance food|pfg/i.test(text)
          ? 'Performance Food Group'
          : /capital city/i.test(text)
            ? 'Capital City Beverage'
            : /southern glazer|glazer'?s/i.test(text)
              ? "Southern Glazer's"
              : /republic national|\brndc\b/i.test(text)
                ? 'RNDC'
                : /package store|liquor/i.test(text)
                  ? 'Lincoln Road Package Store'
                  : nameLikeFile(fileName)

  // A "page 1 of N" / "continued" invoice puts its grand total on a later page,
  // so the largest number here is NOT the total — leave it blank rather than
  // guess a mid-invoice figure (a keg deposit, a line total) the manager then
  // has to correct.
  const continued = /\bcontinued\b|page\s*1\s*of\s*[2-9]/i.test(text)
  // Prefer a labeled total; else the largest dollar amount (single-page only).
  const labeled = text.match(
    /(?:invoice total|total due|amount due|grand total|balance due|new balance|total)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  )
  let total = labeled ? num(labeled[1]) : 0
  if (!total && !continued) {
    const all = (text.match(/\$?\s?[\d,]+\.\d{2}/g) || []).map(num)
    total = all.length ? Math.max(...all) : 0
  }
  // Invoice number must contain a digit — otherwise a stray word after the
  // label (e.g. "3)Invoice Charges" → "Charges") gets mistaken for the number.
  let number = ''
  for (const m of text.matchAll(/(?:invoice|inv)\s*#?\s*[:\-]?\s*([A-Z]?-?[A-Z0-9][A-Z0-9-]{2,})/gi)) {
    if (/\d/.test(m[1])) { number = m[1]; break }
  }
  // Distributor invoice numbers often sit under a column header (not beside a
  // label), so the label search above can't reach them — fall back to their
  // distinctive shape: a letter, a dash, then a run of digits (e.g. W-3792583).
  if (!number) number = text.match(/\b([A-Z]-\d{6,9})\b/)?.[1] ?? ''
  // Invoice date: labeled first, else the first US-style date on the page.
  let date: string | undefined
  const d =
    text.match(/(?:invoice date|date)\s*[:\-]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i) ||
    text.match(/\b(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})\b/)
  if (d) {
    const yr = d[3].length === 2 ? `20${d[3]}` : d[3]
    date = `${yr}-${String(d[1]).padStart(2, '0')}-${String(d[2]).padStart(2, '0')}`
  }
  return { vendor, total, number, date }
}

function num(s: string): number {
  return parseFloat(String(s).replace(/[^0-9.]/g, '')) || 0
}

/**
 * Use a file's name as the vendor only when it actually reads like one — real
 * words, not a code like "capcity72026" or "IMG_4821". Otherwise return the
 * neutral "Vendor" so the Receiving screen falls back to the vendor picker
 * instead of filing under a garbled name.
 */
function nameLikeFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  if (!base) return 'Vendor'
  const words = base.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z']+$/.test(w) && w.length > 2)
  // Reject camera/scanner defaults and digit-laden codes.
  if (/^(img|image|scan|photo|doc|invoice|file)\b/i.test(base) || /\d/.test(base)) return 'Vendor'
  return words.length >= 1 ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Vendor'
}
