import * as pdfjs from 'pdfjs-dist'

// Self-hosted worker with polyfills (see public/pdfjs/worker-polyfilled.mjs) —
// pdf.js's renderer needs JS APIs some browsers don't ship yet.
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdfjs/worker-polyfilled.mjs`

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

// OCR engine + English model are self-hosted with the app — no CDN, works
// offline, and behaves identically on every device. Paths must be ABSOLUTE:
// the OCR worker resolves relative paths against its own folder, not the page.
const OCR_BASE = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).href
const OCR_OPTS = {
  workerPath: `${OCR_BASE}worker.min.js`,
  corePath: `${OCR_BASE}tesseract-core-simd-lstm.wasm.js`,
  langPath: OCR_BASE.replace(/\/$/, ''),
}

/** OCR a photo / scanned image. Tesseract loads its engine on first use. */
async function readImage(file: File | HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const Tesseract = (await import('tesseract.js')).default
  const { data } = await Tesseract.recognize(file as File, 'eng', {
    ...OCR_OPTS,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) onProgress(m.progress)
    },
  })
  return (data.text || '').trim()
}

/**
 * Render a PDF's pages to canvases and OCR them. This is the only way to read
 * PDFs whose numbers are invisible to the text layer (ezCater embeds every
 * digit in a font the text layer can't expose — "Deliver at __:__",
 * "HEADCOUNT __") and scanned PDFs with no text layer at all.
 */
async function ocrPdfPages(file: File, onProgress?: (p: number) => void, maxPages = 2): Promise<string> {
  const buf = await file.arrayBuffer()
  // standardFontDataUrl: without it, non-embedded fonts (ezCater's digit
  // font) render as BLANKS on the canvas and even OCR can't see the numbers.
  const pdf = await pdfjs.getDocument({
    data: buf,
    standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`,
    // Draw glyph outlines straight from the embedded font programs instead of
    // going through the browser's font engine — the only way ezCater's
    // digit font actually paints its numbers onto the canvas.
    disableFontFace: true,
  }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const out: string[] = []
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p)
    const viewport = page.getViewport({ scale: 3 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const text = await readImage(canvas, (pr) => onProgress?.((p - 1 + pr) / pages))
    out.push(text)
  }
  return out.join('\n').trim()
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
      // Hidden-digit detection (prototype spec): a PDF whose text layer has
      // labels but almost no digits (ezCater), or no text at all (a scan),
      // gets rendered to images and read with OCR instead. Slower (~30s)
      // but it actually reads the numbers.
      const digits = (text.match(/\d/g) || []).length
      if (text.length < 8 || digits < 10) {
        note =
          digits > 0
            ? 'This PDF hides its numbers from text extraction — read it with OCR instead.'
            : 'Scanned PDF — read with OCR.'
        const ocr = await ocrPdfPages(file, onProgress).catch((err) => {
          console.warn('PDF OCR failed:', err)
          return ''
        })
        // Keep whichever version actually READ THE NUMBERS.
        const ocrDigits = (ocr.match(/\d/g) || []).length
        console.info(`PDF OCR: layer ${text.length} chars/${digits} digits · ocr ${ocr.length} chars/${ocrDigits} digits`)
        if (ocrDigits > digits) text = ocr
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
    // Excel exports (Toast often ships .xlsx inside its zips) → convert every
    // sheet to CSV text and run it through the same parsers.
    if (['xlsx', 'xls'].includes(ext || '') || type.includes('spreadsheet') || type.includes('ms-excel')) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const text = wb.SheetNames.map((sn) => XLSX.utils.sheet_to_csv(wb.Sheets[sn], { dateNF: 'yyyy-mm-dd' }))
        .join('\n')
        .trim()
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
