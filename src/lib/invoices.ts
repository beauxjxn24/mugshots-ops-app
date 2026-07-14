import { load, save } from './store'
import { useScope } from './scope'

export interface Invoice {
  id: string
  vendor: string
  date: string
  number: string
  total: number
  paid: boolean
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
          : /package store|liquor/i.test(text)
            ? 'Lincoln Road Package Store'
            : fileName.replace(/\.[^.]+$/, '') || 'Vendor'

  // Prefer a labeled total; fall back to the largest dollar amount.
  const labeled = text.match(
    /(?:invoice total|total due|amount due|grand total|balance due|new balance|total)\s*[:\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  )
  let total = labeled ? num(labeled[1]) : 0
  if (!total) {
    const all = (text.match(/\$?\s?[\d,]+\.\d{2}/g) || []).map(num)
    total = all.length ? Math.max(...all) : 0
  }
  const number = text.match(/(?:invoice|inv)\s*#?\s*([A-Z0-9][A-Z0-9-]{2,})/i)?.[1] ?? ''
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
