import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ReadResult {
  fileName: string
  kind: 'pdf' | 'image' | 'text' | 'unsupported'
  text: string
  /** Best-effort structured line items pulled from the text. */
  lineItems: LineItem[]
  note?: string
}

export interface LineItem {
  description: string
  qty?: string
  price?: string
}

/**
 * Extract text from a PDF's text layer (fast, offline). pdf.js emits loose text
 * runs with no line breaks, so we regroup them into visual rows by their Y
 * coordinate — this is what makes tabular invoices parse into line items.
 */
async function readPdf(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buf }).promise
  const out: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const rows = new Map<number, Array<[number, string]>>()
    for (const it of content.items) {
      if (!('str' in it) || !it.str) continue
      const x = it.transform[4]
      const yBucket = Math.round(it.transform[5] / 3) // ~3px tolerance per row
      if (!rows.has(yBucket)) rows.set(yBucket, [])
      rows.get(yBucket)!.push([x, it.str])
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF y grows upward → top rows first
      .map(([, cells]) =>
        cells
          .sort((a, b) => a[0] - b[0])
          .map((c) => c[1])
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
    out.push(lines.join('\n'))
  }
  return out.join('\n').trim()
}

/** OCR a photo / scanned image. Tesseract loads its engine on first use. */
async function readImage(file: File, onProgress?: (p: number) => void): Promise<string> {
  const Tesseract = (await import('tesseract.js')).default
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  return (data.text || '').trim()
}

/**
 * Pull candidate line items from raw invoice / order-guide text.
 * Heuristic and intentionally forgiving — the reader shows the raw text too,
 * so nothing is lost if the parse misses a row.
 */
export function parseLineItems(text: string): LineItem[] {
  const items: LineItem[] = []
  const money = /\$?\d{1,3}(?:,\d{3})*\.\d{2}/g
  // Order qty sits next to a unit; product codes (120CT, 35LB) also match, so we
  // take the LAST unit-match on the line — the order qty comes after the name.
  const unit = /(\d{1,4})\s*(cs|ct|ea|lb|lbs|case|cases|each|pk|bg|dz|gal|#)\b/gi
  const skip = /\b(sub-?total|total|tax|amount\s*due|balance|invoice|account|page|remit|terms)\b/i

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length < 4 || skip.test(line)) continue
    const prices = line.match(money)
    if (!prices) continue
    const price = prices[prices.length - 1]

    let last: RegExpExecArray | null = null
    const re = new RegExp(unit)
    for (let m = re.exec(line); m; m = re.exec(line)) last = m
    const qty = last?.[1]

    let description = line.replace(money, '')
    if (last) description = description.replace(last[0], ' ')
    description = description.replace(/\s{2,}/g, ' ').trim()
    if (description.length < 3) continue

    items.push({ description, qty, price })
  }
  return items
}

export async function readFile(
  file: File,
  onProgress?: (p: number) => void,
): Promise<ReadResult> {
  const name = file.name
  const type = file.type
  const ext = name.split('.').pop()?.toLowerCase()

  try {
    if (type === 'application/pdf' || ext === 'pdf') {
      let text = await readPdf(file)
      let note: string | undefined
      // Scanned PDF (image-only) → no text layer. Fall back to OCR of page 1.
      if (text.length < 8) {
        note = 'Scanned PDF — used OCR (may be slower / less exact).'
        text = await readImage(file, onProgress).catch(() => '')
      }
      return { fileName: name, kind: 'pdf', text, lineItems: parseLineItems(text), note }
    }
    if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'heic'].includes(ext || '')) {
      const text = await readImage(file, onProgress)
      return { fileName: name, kind: 'image', text, lineItems: parseLineItems(text) }
    }
    if (type.startsWith('text/') || ['csv', 'txt'].includes(ext || '')) {
      const text = (await file.text()).trim()
      return { fileName: name, kind: 'text', text, lineItems: parseLineItems(text) }
    }
    return {
      fileName: name,
      kind: 'unsupported',
      text: '',
      lineItems: [],
      note: `Unsupported file type: ${type || ext || 'unknown'}`,
    }
  } catch (err) {
    return {
      fileName: name,
      kind: 'unsupported',
      text: '',
      lineItems: [],
      note: `Could not read this file: ${(err as Error).message}`,
    }
  }
}
