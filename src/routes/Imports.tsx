import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Camera, CloudUpload, FileCheck2, CircleAlert, Loader2, ReceiptText } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { today, usePersistentState } from '../lib/store'
import { readFile, type ReadResult, type LineItem } from '../lib/reader'
import { getOrdering, proposeReceipts, applyReceipts, setParEntry, vendors, type Receipt } from '../lib/ordering'
import { updatePrices, registerItem, addAlias, setItemCost, setOnGuide } from '../lib/catalog'
import { addInvoice, parseInvoice } from '../lib/invoices'
import { isCateringDoc, parseCatering, addBooking, recordCateringImport } from '../lib/catering'
import { isSalesSummary, parseSalesSummary, upsertNights, isCategorySummary, parseCategorySummary, setCatMix, isLaborReport, parseLaborByDay, applyLaborRows } from '../lib/nightly'
import { isRosterDoc, importPeople, addPeople } from '../lib/staff'
import { isCountSheet, parseCountSheet, getCountSheet, setCountSheet, sheetLocations, receiveIntoInventory, type CountItem } from '../lib/countsheet'
import { isPmixReport, parsePmix, savePmixDay } from '../lib/pmix'
import { logImport, useImportLog } from '../lib/importlog'
import { saveDoc, fileHash, findSeenFile, recordSeenFile } from '../lib/docs'
import { placeItemInGuide, GUIDE_SHELVES, type GuideShelf } from '../lib/guide'
import { confirmDelete } from '../lib/confirm'
import { useIsPhone } from '../lib/useIsPhone'
import { CalendarPlus, PartyPopper, LineChart, Users, PieChart, Plus } from 'lucide-react'

interface Job extends Partial<ReadResult> {
  id: string
  fileName: string
  status: 'reading' | 'done' | 'error' | 'duplicate'
  progress: number
  /** IndexedDB id of the original document — invoices link back to it. */
  docId?: string
  /** True when this file came out of a dropped .zip (a bulk report export). */
  fromZip?: boolean
  /** When status is 'duplicate': the earlier import this file matches. */
  dupOf?: { name: string; at: string }
}

const money2 = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let seq = 0

// Toast report zips bundle many internal-breakdown CSVs we never import; skip
// them on extraction (the useful ones — Sales by day, Sales category summary,
// Items — don't match this).
const NOISE_REPORT =
  /all levels|percentage breakdown|modifiers|menu ?groups?|^menus|open items|special requests|comparison labels|total sales|revenue|tip summary|payments summary|service (mode|charge|daypart)|dining options|tax summary|deferred|unpaid orders|void summary|cash (activity|summary)|day of week|time of day|net sales summary|(menu item|check) discounts/i

/** Contains a render crash in one import card so it can't white-screen the page. */
class CardBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs font-semibold text-warn">
          Couldn’t read “{this.props.name}” — skipped. Try a cleaner export or drop it on its own.
        </div>
      )
    return this.props.children
  }
}

export function Imports() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [drag, setDrag] = useState(false)
  const isPhone = useIsPhone()
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const recentDrops = useRef<Map<string, number>>(new Map())
  // Files parked behind a duplicate warning, kept so "Import anyway" works.
  const parked = useRef<Map<string, File>>(new Map())

  const processOne = useCallback(async (file: File, id: string, fromZip = false) => {
    const docId = `doc${Date.now().toString(36)}${seq}`
    void saveDoc(docId, file) // keep the original — invoices reopen it
    setJobs((j) => {
      const fresh: Job = { id, fileName: file.name, status: 'reading', progress: 0, docId, fromZip }
      return j.some((x) => x.id === id) ? j.map((x) => (x.id === id ? fresh : x)) : [fresh, ...j]
    })
    const res = await readFile(file, (p) =>
      setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: p } : x))),
    )
    setJobs((j) =>
      j.map((x) =>
        x.id === id
          ? { ...x, ...res, status: res.kind === 'unsupported' ? 'error' : 'done', progress: 1 }
          : x,
      ),
    )
    // Every read lands in the permanent import history.
    if (res.kind === 'unsupported') {
      logImport(file.name, `⚠ could not read${res.note ? ` — ${res.note}` : ''}`)
    } else {
      const detected = isCountSheet(res.text)
        ? `inventory count sheet (${parseCountSheet(res.text).length} items) — review below`
        : isCategorySummary(res.text)
        ? 'sales category summary — review below'
        : isLaborReport(res.text)
        ? `labor report (${parseLaborByDay(res.text).length} days) — review below`
        : isSalesSummary(res.text)
        ? `sales summary (${parseSalesSummary(res.text).length} days) — review below`
        : isRosterDoc(res.text)
          ? 'employee roster — review below'
          : isCateringDoc(res.text)
            ? 'catering order — review below'
            : res.lineItems.length > 0
              ? `${res.lineItems.length} line items — review below`
              : 'read'
      logImport(file.name, `read · ${detected}`)
    }
  }, [])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    // Guard: the same file arriving twice within a few seconds is a double
    // event (drop fired two handlers, picker re-fired) — process it once.
    const now = Date.now()
    const fresh = Array.from(files).filter((f) => {
      const key = `${f.name}|${f.size}`
      const last = recentDrops.current.get(key)
      recentDrops.current.set(key, now)
      return !(last && now - last < 4000)
    })
    if (fresh.length === 0) return
    // Toast exports arrive zipped — expand them and feed every file inside
    // through the same reader, so a dropped .zip "just works". Files pulled out
    // of a zip are re-importable bulk exports (sales summaries upsert by date),
    // so they skip the duplicate guard — re-dropping a Toast export must always
    // refresh the numbers, never get silently skipped as "already imported".
    const list: { file: File; fromZip: boolean }[] = []
    for (const file of fresh) {
      if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
        try {
          const { unzipSync } = await import('fflate')
          const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
          for (const [path, bytes] of Object.entries(entries)) {
            const name = path.split('/').pop() ?? path
            if (!name || path.endsWith('/') || path.includes('__MACOSX') || name.startsWith('.')) continue
            // Toast report zips bundle 10–20 CSVs, but only a few carry data we
            // use (sales by day, sales category summary, product-mix items). The
            // rest are giant internal breakdowns (All levels, Percentage
            // breakdown, Modifiers…) — skip them so they don't clutter the
            // review list or choke a parser on 6,000 rows.
            if (NOISE_REPORT.test(name)) continue
            list.push({ file: new File([bytes.slice().buffer as ArrayBuffer], name), fromZip: true })
          }
          continue
        } catch {
          /* fall through — the reader reports it honestly */
        }
      }
      list.push({ file, fromZip: false })
    }
    for (const { file, fromZip } of list) {
      const id = `j${++seq}`
      // Duplicate check: the exact same bytes seen before — invoice, spec
      // card, recipe, any PDF — gets flagged instead of importing twice.
      // Data reports (CSV/TSV/TXT) and anything unzipped are ALWAYS re-imported:
      // their importers upsert by date, so re-dropping a sales summary / PMIX /
      // count sheet must refresh the numbers, never be skipped as "duplicate".
      const reimportable = fromZip || /\.(csv|tsv|txt)$/i.test(file.name)
      const h = await fileHash(file)
      const seen = reimportable ? null : findSeenFile(h)
      if (seen) {
        parked.current.set(id, file)
        setJobs((j) => [
          { id, fileName: file.name, status: 'duplicate', progress: 1, dupOf: { name: seen.name, at: seen.at } },
          ...j,
        ])
        logImport(file.name, `⚠ duplicate of ${seen.name} (imported ${seen.at}) — skipped`)
        continue
      }
      recordSeenFile(h, file.name)
      await processOne(file, id, fromZip)
    }
  }, [processOne])

  const importAnyway = useCallback(
    (id: string) => {
      const file = parked.current.get(id)
      if (!file) return
      parked.current.delete(id)
      logImport(file.name, 'duplicate imported anyway')
      void processOne(file, id)
    },
    [processOne],
  )

  // ONE drop path only: the window listener below catches drops anywhere on
  // the page, including on the box. (A second onDrop on the box itself made
  // every drop process twice — two tiles per file.)
  useEffect(() => {
    const onWinDrop = (e: DragEvent) => {
      if (e.dataTransfer?.files?.length) {
        e.preventDefault()
        handleFiles(e.dataTransfer.files)
        setDrag(false)
      }
    }
    const onWinDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) setDrag(true)
    }
    window.addEventListener('drop', onWinDrop)
    window.addEventListener('dragover', onWinDragOver)
    return () => {
      window.removeEventListener('drop', onWinDrop)
      window.removeEventListener('dragover', onWinDragOver)
    }
  }, [handleFiles])

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle="Drop an invoice, order guide, price sheet, or ezCater order — PDF or a photo"
      />
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Phone hero: snapping an invoice is the phone app's main job */}
        {isPhone && (
          <div className="space-y-3">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-2xl bg-brand px-5 py-7 text-white shadow-lg active:scale-[0.99]"
            >
              <Camera size={34} />
              <span className="font-display text-xl font-semibold">Snap an invoice</span>
              <span className="text-xs font-medium text-white/85">Take a photo — it's read on the phone and logged</span>
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-bold text-ink"
            >
              <CloudUpload size={16} /> Choose a PDF or saved photo
            </button>
            <Link to="/invoices" className="block text-center text-xs font-bold text-brand">
              View the invoice log →
            </Link>
          </div>
        )}

        {/* Daily reports tracker — what still needs to be dropped today */}
        <DailyReports />

        {/* Catch-up import — the prototype Admin's first-time-setup recipe */}
        <details open className={`rounded-2xl border border-brand/25 bg-brand/[0.06] px-4 py-3 ${isPhone ? 'hidden' : ''}`}>
          <summary className="cursor-pointer text-sm font-bold text-ink">
            Catch-up import <span className="ml-1 rounded bg-brand/20 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-brand-600">first-time setup</span>
            <span className="ml-2 text-xs font-normal text-muted">seed a store with real history in one drop</span>
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink/80">
            <li>In Toast, set the date range to the <b>last full quarter</b> (about 13 weeks).</li>
            <li>Export <b>Sales → Sales Summary</b> (a .zip is fine — drop it as-is).</li>
            <li>Export <b>Labor → Labor cost summary</b> (CSV) for the same range.</li>
            <li>Export <b>Sales → Product Mix</b> (CSV) — the items report.</li>
            <li>Drop them all right here, together — order doesn't matter. Each file shows what it loaded below.</li>
          </ol>
          <p className="mt-2 text-[11px] font-bold text-down">
            Every export must be CSV — not Excel. In Toast choose CSV on export. Backfills daily
            sales, labor, and product mix — reconciles to Toast's own totals, nothing invented.
          </p>
        </details>

        {/* Drop zone — desktop / tablet (phone leads with the camera hero above) */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition-colors ${isPhone ? 'hidden' : ''} ${
            drag ? 'border-brand bg-brand/10' : 'border-black/15 bg-white/60 hover:border-brand/50'
          }`}
        >
          <div className="mb-4 flex items-center justify-center gap-4 text-brand">
            <span className="grid size-14 place-items-center rounded-2xl bg-brand/10">
              <FileText size={26} />
            </span>
            <span className="grid size-14 place-items-center rounded-2xl bg-brand/10">
              <Camera size={26} />
            </span>
            <span className="grid size-14 place-items-center rounded-2xl bg-brand/10">
              <CloudUpload size={26} />
            </span>
          </div>
          <div className="mt-2 font-display text-2xl font-semibold text-ink">
            Drop files here, or tap to choose
          </div>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted text-pretty">
            Drop a whole batch at once — sales summaries, PMIX, invoices, order guides. PDFs read
            instantly; photos of invoices read with on-device OCR. Each file shows what it loaded below.
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              cameraRef.current?.click()
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink"
          >
            <Camera size={15} /> Take a photo instead
          </button>
          {/* Main picker: NO capture attribute — phones must be able to pick PDFs
              and existing photos from the gallery, not just open the camera. */}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.csv,.txt,.zip,.xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
              e.target.value = '' // so picking the same file again still fires
            }}
          />
          {/* Camera-only path, offered as an explicit second button. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files)
              e.target.value = '' // so re-shooting the same photo still fires
            }}
          />
        </div>

        {/* Results */}
        {jobs.map((job) => (
          <Card key={job.id} className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{job.fileName}</div>
                <div className="text-xs text-muted">
                  {job.status === 'reading'
                    ? `Reading… ${Math.round((job.progress || 0) * 100)}%`
                    : job.status === 'duplicate'
                      ? 'Nothing was imported'
                      : job.kind === 'unsupported'
                        ? 'Could not read'
                        : `${job.kind?.toUpperCase()} · ${job.lineItems?.length ?? 0} line items found`}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  job.status === 'done'
                    ? 'bg-up/10 text-up'
                    : job.status === 'error'
                      ? 'bg-down/10 text-down'
                      : job.status === 'duplicate'
                        ? 'bg-warn/15 text-warn'
                        : 'bg-brand/10 text-brand'
                }`}
              >
                {job.status === 'reading' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Reading
                  </>
                ) : job.status === 'done' ? (
                  <>
                    <FileCheck2 size={12} /> Read
                  </>
                ) : job.status === 'duplicate' ? (
                  <>
                    <CircleAlert size={12} /> Duplicate
                  </>
                ) : (
                  <>
                    <CircleAlert size={12} /> Error
                  </>
                )}
              </span>
            </div>

            {job.status === 'duplicate' && job.dupOf && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2.5">
                <p className="text-sm text-ink">
                  This exact file was already imported <b>{job.dupOf.at}</b> as <b>{job.dupOf.name}</b>.
                </p>
                <button
                  onClick={() => importAnyway(job.id)}
                  className="rounded-lg border border-warn/40 px-3 py-1.5 text-xs font-bold text-warn hover:bg-warn/10"
                >
                  Import anyway →
                </button>
              </div>
            )}

            {job.note && <p className="mt-2 text-xs text-warn">{job.note}</p>}

            {job.lineItems && job.lineItems.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                      <th className="py-1 pr-3 font-semibold">Item</th>
                      <th className="py-1 pr-3 font-semibold">Qty</th>
                      <th className="py-1 font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.lineItems.slice(0, 40).map((li, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="py-1 pr-3">{li.description}</td>
                        <td className="py-1 pr-3 font-mono text-xs text-muted">{li.qty ?? '—'}</td>
                        <td className="py-1 font-mono text-xs">{li.price ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {job.text && (
              <CardBoundary name={job.fileName}>
            {job.text && isRosterDoc(job.text) && <StaffImport text={job.text} fileName={job.fileName} />}

            {job.text && isCategorySummary(job.text) && <CategoryImport text={job.text} fileName={job.fileName} />}

            {job.text && isLaborReport(job.text) && <LaborImport text={job.text} fileName={job.fileName} />}

            {job.text && isSalesSummary(job.text) && !isCategorySummary(job.text) && !isLaborReport(job.text) && (
              <SalesImport text={job.text} fileName={job.fileName} />
            )}

            {job.text && isCateringDoc(job.text) && (
              <CateringImport text={job.text} fileName={job.fileName} />
            )}

            {job.text && isCountSheet(job.text) && (
              <CountSheetImport text={job.text} fileName={job.fileName} />
            )}

            {job.text && isPmixReport(job.text) && !isCountSheet(job.text) && (
              <PmixImport text={job.text} fileName={job.fileName} />
            )}

            {/* EVERY invoice / delivery scan → the Receiving sheet, where each
                line is matched to the order guide and confirmed (or added). A
                photo whose lines OCR couldn't read still opens the sheet — add
                the items by hand there. Only a vendor PRICE sheet (prices, no
                order qty, from a CSV/Excel) routes to a price-only update. */}
            {(() => {
              const t = job.text ?? ''
              if (!t || job.status !== 'done') return null
              const recognized =
                isSalesSummary(t) || isCategorySummary(t) || isLaborReport(t) || isRosterDoc(t) || isCateringDoc(t) || isCountSheet(t) || (isPmixReport(t) && !isCountSheet(t))
              if (recognized) return null
              const hasQtyLines = !!job.lineItems?.some((li) => li.qty)
              const scan = job.kind === 'image' || job.kind === 'pdf'
              const priceSheet = !scan && !hasQtyLines && !!job.lineItems && job.lineItems.length > 0
              if (priceSheet) return <PriceUpdate lineItems={job.lineItems!} text={t} fileName={job.fileName} />
              return <Receiving lineItems={job.lineItems ?? []} fileName={job.fileName} text={t} docId={job.docId} />
            })()}
              </CardBoundary>
            )}

            {job.text && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted">
                  Raw extracted text
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-black/5 p-3 text-xs whitespace-pre-wrap">
                  {job.text}
                </pre>
              </details>
            )}
          </Card>
        ))}

        <ImportHistory />
      </div>
    </>
  )
}

/** Permanent import history — every drop and where it went. Survives reloads. */
function ImportHistory() {
  const entries = useImportLog((s) => s.entries)
  const clear = useImportLog((s) => s.clear)
  if (entries.length === 0) return null
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/5 bg-black/[0.02] px-4 py-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
          Import history
        </span>
        <button
          onClick={async () => {
            if (await confirmDelete('Clear the import history?', 'The imported data itself stays where it landed.', 'Clear'))
              clear()
          }}
          className="text-xs font-semibold text-muted hover:text-down"
        >
          Clear
        </button>
      </div>
      {entries.map((e) => (
        <div key={e.id} className="flex items-baseline gap-3 border-b border-black/5 px-4 py-2 text-sm last:border-0">
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.file}</span>
          <span className={`min-w-0 flex-1 truncate text-xs ${e.outcome.startsWith('⚠') ? 'text-down' : e.outcome.includes('→') ? 'text-up' : 'text-muted'}`}>
            {e.outcome}
          </span>
          <span className="shrink-0 text-[10px] text-muted">{e.at}</span>
        </div>
      ))}
    </Card>
  )
}

/**
 * Review + post extracted invoice lines into Ordering on-hand counts.
 * Every line is pre-matched (fuzzy) to an order-guide item; the user confirms,
 * re-maps, or skips before anything is written. Nothing applies automatically.
 */
interface Row {
  description: string // editable — correct what the reader thought it said
  raw: string // exactly what was read; corrections teach the reader (saved as alias)
  qty: number
  price?: number // case cost from the invoice line — carried into the catalog
  code?: string // vendor item code split off the name
  size?: string // pack size split off the name (750ml, 4/5LB…)
  // '' = nothing picked, 'NEW' = add to the guide as a new item, otherwise "vendor||itemId"
  target: string
  // Owner spec: every line gets an explicit decision — confirm the proposed
  // guide match, add it to the guide, or skip it. Nothing applies silently.
  resolved: '' | 'confirmed' | 'new' | 'skip'
  /** Manual-override select open for this row. */
  picking?: boolean
}

/**
 * Receiving — the invoice→order-guide mapping sheet (owner spec): every line
 * is tied to a REAL guide item. The reader proposes its best match; you
 * confirm it (learned forever) or add the line to the guide, where it lands
 * in the right section — never dumped at the bottom.
 */
function Receiving({ lineItems, fileName, text, docId }: { lineItems: LineItem[]; fileName: string; text: string; docId?: string }) {
  const [applied, setApplied] = useState<{
    received: number
    repriced: number
    added: number
    receivedInv: number
    invoiceTotal: number
    vendor: string
  } | null>(null)
  const [rows, setRows] = useState<Row[]>(() =>
    proposeReceipts(lineItems).map((p) => ({
      description: p.description,
      raw: p.description,
      qty: p.qty,
      price: p.price,
      code: p.code,
      size: p.size,
      target: p.match ? `${p.match.vendor}||${p.match.item.id}` : '',
      // A learned (alias/exact) match confirms itself — it came from a
      // previous confirmation. Fuzzy proposals wait for the button.
      resolved: p.match && (p.match as { exact?: boolean }).exact ? 'confirmed' : '',
    })),
  )
  const isPhone = useIsPhone()
  const inv = useMemo(() => parseInvoice(text, fileName), [text, fileName])
  const vendorList = useMemo(() => vendors(), [])
  const [vendor, setVendor] = useState(inv.vendor && inv.vendor !== 'Vendor' ? inv.vendor : (vendorList[0] ?? 'US Foods'))
  // Editable invoice header — OCR often misses the total / number, so the manager
  // can complete them here before filing.
  const [invTotal, setInvTotal] = useState(inv.total ? String(inv.total) : '')
  const [invNumber, setInvNumber] = useState(inv.number ?? '')
  const [invDate, setInvDate] = useState(inv.date ?? today())
  const total = parseFloat((invTotal || '').replace(/[^0-9.]/g, '')) || 0
  const addRow = () =>
    setRows((rs) => [...rs, { description: '', raw: '', qty: 1, target: '', resolved: '', picking: true }])
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))

  const options = useMemo(() => {
    const data = getOrdering()
    return Object.entries(data).flatMap(([v, items]) => items.map((it) => ({ v, id: it.id, label: it.name })))
  }, [])
  const labelFor = (target: string) => options.find((o) => `${o.v}||${o.id}` === target)?.label ?? '?'

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const confirmed = rows.filter((r) => r.resolved === 'confirmed' && r.target && r.target !== 'NEW')
  const adds = rows.filter((r) => r.resolved === 'new' && r.description.trim())
  const unresolvedMatches = rows.filter((r) => r.resolved === '' && r.target && r.target !== 'NEW').length
  // Blank rows (a just-added line the manager hasn't typed yet) don't block apply.
  const unresolved = rows.filter((r) => r.resolved === '' && r.description.trim()).length

  const apply = () => {
    const receipts: Receipt[] = confirmed
      .filter((r) => r.qty > 0)
      .map((r) => {
        const [v, itemId] = r.target.split('||')
        return { vendor: v, itemId, qty: r.qty, cost: r.price }
      })
    const updated = applyReceipts(receipts, invDate || undefined)
    let repriced = 0
    for (const r of confirmed) {
      const itemId = r.target.split('||')[1]
      // Learn BOTH spellings: the corrected name and exactly what was read —
      // next invoice, the raw reading auto-matches without a correction.
      addAlias(itemId, r.description)
      addAlias(itemId, r.raw)
      if (r.price && r.price > 0) {
        setItemCost(itemId, r.price, vendor)
        repriced++
      }
    }
    let added = 0
    adds.forEach((r) => {
      // registerItem de-dupes by name AND alias — the catalog never doubles up.
      const ci = registerItem({ name: r.description.trim(), unit: 'cs', vendor, cost: r.price, code: r.code, size: r.size })
      if (r.raw !== r.description) addAlias(ci.id, r.raw)
      setOnGuide(ci.id, true)
      // Slot it into the right SECTION of its shelf's guide (vodka with the
      // vodkas…), instead of piling up at the bottom.
      const shelf = (GUIDE_SHELVES as readonly string[]).includes(ci.category) ? (ci.category as GuideShelf) : 'Other'
      placeItemInGuide(shelf, ci.id, ci.name)
      // Through applyReceipts (not a bare count) so the line lands in the
      // receipts log — the Orders Usage view reads that.
      applyReceipts([{ vendor, itemId: ci.id, qty: Math.max(0, r.qty), cost: r.price }], invDate || undefined)
      added++
    })
    // Tie the delivery into Inventory: every received line lands in the
    // Receiving area with its quantity, ready to put away during the count.
    const receivedInv = receiveIntoInventory(
      [...confirmed, ...adds].map((r) => ({ name: r.description.trim(), qty: r.qty, uom: r.size })),
      invDate || today(),
    )
    // File the invoice — qty, price, date, done.
    if (total > 0) {
      addInvoice({
        id: `inv${Date.now()}`,
        vendor,
        date: invDate || today(),
        number: invNumber,
        total,
        paid: false,
        docId,
      })
    }
    const summary = `${updated + added} received${repriced ? ` · ${repriced} price${repriced === 1 ? '' : 's'} updated` : ''}${added ? ` · ${added} new → Catalog` : ''}${receivedInv ? ` · ${receivedInv} → Inventory · Receiving` : ''}${total > 0 ? ` · invoice ${money2(total)} filed` : ''}`
    setApplied({ received: updated + added, repriced, added, receivedInv, invoiceTotal: total, vendor })
    logImport(fileName, summary)
  }

  if (applied) {
    const Line = ({ ok, children }: { ok: boolean; children: ReactNode }) =>
      ok ? (
        <div className="flex items-center gap-2 text-sm text-ink">
          <span className="grid size-4 shrink-0 place-items-center rounded-full bg-up text-[9px] text-white">✓</span>
          {children}
        </div>
      ) : null
    return (
      <div className="mt-3 rounded-xl border border-up/40 bg-up/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-up">
          <FileCheck2 size={16} /> Delivery received — all set.
        </div>
        <div className="space-y-1.5">
          <Line ok={applied.invoiceTotal > 0}>
            Invoice <b>{money2(applied.invoiceTotal)}</b> filed under <b>{applied.vendor}</b> →{' '}
            <Link to="/invoices" className="font-bold text-brand">Invoices</Link>
          </Line>
          <Line ok={applied.receivedInv > 0}>
            <b>{applied.receivedInv}</b> line{applied.receivedInv === 1 ? '' : 's'} put on the receiving dock →{' '}
            <Link to="/inventory" className="font-bold text-brand">Inventory</Link>
          </Line>
          <Line ok={applied.added > 0}>
            <b>{applied.added}</b> new item{applied.added === 1 ? '' : 's'} added to the catalog &amp; order guide →{' '}
            <Link to="/ordering" className="font-bold text-brand">Ordering</Link>
          </Line>
          <Line ok={applied.repriced > 0}>
            <b>{applied.repriced}</b> price{applied.repriced === 1 ? '' : 's'} updated everywhere →{' '}
            <Link to="/costs" className="font-bold text-brand">Costs</Link>
          </Line>
        </div>
        <p className="mt-2.5 text-[11px] text-muted">
          Nothing more to do here — put the delivery away during your next inventory count.
        </p>
      </div>
    )
  }

  // The mapping controls (confirm the best match / add to guide / pick / skip),
  // shared by the desktop row and the phone card. `phone` bumps tap targets.
  const mapping = (r: Row, i: number, phone: boolean) => {
    const wrap = phone ? 'flex w-full flex-wrap items-center gap-2' : 'flex min-w-0 items-center justify-end gap-1'
    const big = phone ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[11px]'
    const sm = phone ? 'px-2 py-2 text-xs font-semibold' : 'text-[10px] font-semibold'
    const chip = phone ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-[11px]'
    const remove = (
      <button
        onClick={() => removeRow(i)}
        title="Remove this line"
        aria-label="Remove this line"
        className={`shrink-0 rounded-lg text-muted hover:bg-black/5 hover:text-down ${phone ? 'px-2 py-2 text-sm' : 'px-1.5 py-1 text-xs'}`}
      >
        ✕
      </button>
    )
    return (
      <span className={wrap}>
        {r.picking ? (
          <select
            autoFocus
            value={r.target}
            onChange={(e) => {
              const v = e.target.value
              setRow(i, { target: v, picking: false, resolved: v === 'NEW' ? 'new' : v === '' ? '' : 'confirmed' })
            }}
            onBlur={() => setRow(i, { picking: false })}
            className="w-full rounded-lg border border-brand/40 bg-white px-1.5 py-2 text-sm outline-none"
          >
            <option value="">— pick from the guide —</option>
            <option value="NEW">➕ add to guide as new item</option>
            {options.map((o) => (
              <option key={o.v + o.id} value={`${o.v}||${o.id}`}>
                {o.label}
              </option>
            ))}
          </select>
        ) : r.resolved === 'confirmed' ? (
          <>
            <span className={`min-w-0 truncate rounded-full bg-up/10 font-bold text-up ${chip}`}>✓ {labelFor(r.target)}</span>
            <button onClick={() => setRow(i, { resolved: '', picking: true })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              change
            </button>
          </>
        ) : r.resolved === 'new' ? (
          <>
            <span className={`min-w-0 truncate rounded-full bg-brand/15 font-bold text-brand-600 ${chip}`}>➕ new — files into its section</span>
            <button onClick={() => setRow(i, { resolved: '', target: '' })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              undo
            </button>
          </>
        ) : r.resolved === 'skip' ? (
          <>
            <span className={`rounded-full bg-black/5 font-bold text-muted ${chip}`}>skipped</span>
            <button onClick={() => setRow(i, { resolved: '' })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              undo
            </button>
          </>
        ) : r.target && r.target !== 'NEW' ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink/70" title={`Best match: ${labelFor(r.target)}`}>
              → {labelFor(r.target)}?
            </span>
            <button onClick={() => setRow(i, { resolved: 'confirmed' })} className={`shrink-0 rounded-lg bg-up font-bold text-white ${big}`}>
              ✓ Confirm
            </button>
            <button onClick={() => setRow(i, { picking: true })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              not it
            </button>
          </>
        ) : (
          <>
            <span className="shrink-0 text-[11px] text-muted">no match —</span>
            <button onClick={() => setRow(i, { resolved: 'new', target: 'NEW' })} className={`shrink-0 rounded-lg bg-brand font-bold text-white ${big}`}>
              ➕ Add to guide
            </button>
            <button onClick={() => setRow(i, { picking: true })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              pick
            </button>
            <button onClick={() => setRow(i, { resolved: 'skip' })} className={`shrink-0 text-muted hover:text-ink ${sm}`}>
              skip
            </button>
          </>
        )}
        {remove}
      </span>
    )
  }

  const nameInput = (r: Row, i: number) => (
    <>
      <input
        value={r.description}
        onChange={(e) => setRow(i, { description: e.target.value })}
        title="Correct the name if we misread it — the correction is remembered"
        className={`w-full rounded-lg border bg-white px-2 py-1.5 text-sm font-semibold text-ink outline-none focus:border-brand ${
          r.description !== r.raw ? 'border-brand/50' : 'border-black/10'
        }`}
      />
      <span className="block truncate font-mono text-[9px] text-muted">
        {r.code && <>{r.code} · </>}
        {r.description !== r.raw && <>read as “{r.raw}”</>}
      </span>
    </>
  )
  const qtyInput = (r: Row, i: number, cls: string) => (
    <input
      type="number"
      inputMode="numeric"
      value={r.qty}
      onChange={(e) => setRow(i, { qty: Math.max(0, parseInt(e.target.value) || 0) })}
      className={cls}
    />
  )

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          Receiving · match every line to your order guide
        </span>
        <span className="text-[11px] text-muted">confirm each item — add it if it’s not on the guide yet</span>
      </div>
      {/* Editable invoice header — vendor / #, date, total (OCR often misses these) */}
      <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg bg-white/70 p-2">
        <label className="text-[10px] font-bold uppercase text-muted">
          Vendor
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            {[...new Set([vendor, ...vendorList])].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          Invoice #
          <input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} placeholder="optional" className="mt-0.5 block w-28 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          Date
          <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className="mt-0.5 block rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
        </label>
        <label className="text-[10px] font-bold uppercase text-muted">
          Total $
          <input inputMode="decimal" value={invTotal} onChange={(e) => setInvTotal(e.target.value)} placeholder="0.00" className="mt-0.5 block w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-right font-mono text-sm outline-none focus:border-brand" />
        </label>
      </div>
      {unresolvedMatches > 1 && (
        <div className="mb-1.5 flex justify-end">
          <button
            onClick={() =>
              setRows((rs) => rs.map((x) => (x.resolved === '' && x.target && x.target !== 'NEW' ? { ...x, resolved: 'confirmed' } : x)))
            }
            className={`rounded-lg border border-up/40 font-bold text-up hover:bg-up/10 ${isPhone ? 'w-full py-2.5 text-sm' : 'px-2.5 py-1 text-[11px]'}`}
          >
            ✓ Confirm all {unresolvedMatches} matches
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white/60 px-3 py-6 text-center">
          <p className="text-sm font-semibold text-ink">No lines read from this invoice</p>
          <p className="mx-auto mt-1 max-w-xs text-[11px] text-muted text-pretty">
            The scan may be faint or handwritten. Add each item by hand below — you’ll still map every one to the
            order guide (or add it if it’s new).
          </p>
        </div>
      ) : isPhone ? (
        /* Phone: one card per line — name, then size/qty/price, then the mapping */
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-black/10 bg-white p-2.5">
              {nameInput(r, i)}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                <span>Size <b className="text-ink">{r.size ?? '—'}</b></span>
                <label className="flex items-center gap-1">
                  Qty {qtyInput(r, i, 'w-14 rounded-lg border border-black/10 bg-white px-1 py-1.5 text-center text-sm text-ink outline-none focus:border-brand')}
                </label>
                <span className="ml-auto font-mono text-ink">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span>
              </div>
              <div className="mt-2">{mapping(r, i, true)}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1.6fr)_60px_48px_66px_minmax(170px,1.4fr)] gap-1.5 border-b border-black/10 pb-1 text-[9px] font-extrabold uppercase tracking-wide text-muted">
            <span>Invoice line</span>
            <span>Size</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Ties to (order guide)</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1.6fr)_60px_48px_66px_minmax(170px,1.4fr)] items-center gap-1.5 border-b border-black/5 py-1.5 last:border-0">
              <span className="min-w-0">{nameInput(r, i)}</span>
              <span className="truncate text-xs text-muted">{r.size ?? '—'}</span>
              {qtyInput(r, i, 'w-full rounded-lg border border-black/10 bg-white px-1 py-1 text-center text-sm outline-none focus:border-brand')}
              <span className="text-right font-mono text-xs text-ink">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span>
              {mapping(r, i, false)}
            </div>
          ))}
        </>
      )}

      <button
        onClick={addRow}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/40 bg-white/60 px-4 py-2.5 text-xs font-bold text-brand-600 hover:bg-brand/5"
      >
        <Plus size={14} /> Add a line the scan missed
      </button>

      <button
        onClick={apply}
        disabled={confirmed.length + adds.length === 0}
        className="mt-3 w-full rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        Log {confirmed.length + adds.length} line{confirmed.length + adds.length === 1 ? '' : 's'} + update prices
        {total > 0 ? ` + file invoice ${money2(total)}` : ''} ✓
      </button>
      {unresolved > 0 && (
        <p className="mt-1.5 text-center text-[11px] text-warn">
          {unresolved} line{unresolved === 1 ? '' : 's'} not decided yet — confirm, add, or skip each one (undecided lines don't apply).
        </p>
      )}
    </div>
  )
}

/**
 * Vendor price import (handoff spec): update the case cost everywhere the
 * item lives, stamp vendor + date, and show each % change ▲▼. Lines not in
 * the catalog get a one-tap Add.
 */
function PriceUpdate({ lineItems, text, fileName }: { lineItems: LineItem[]; text: string; fileName: string }) {
  const vendor = useMemo(() => {
    const m = text.match(/\b(us foods|gulf coast(?: produce)?|sysco|pfg|performance food)\b/i)
    return m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : 'Vendor'
  }, [text])
  const [result, setResult] = useState<ReturnType<typeof updatePrices> | null>(null)
  const [addedMisses, setAddedMisses] = useState<Set<string>>(new Set())

  const run = () => {
    const lines = lineItems
      .map((li) => ({ name: li.description, price: parseFloat((li.price ?? '').replace(/[$,]/g, '')) || 0 }))
      .filter((l) => l.price > 0)
    const r = updatePrices(lines, vendor)
    setResult(r)
    logImport(fileName, `${r.changes.length} case cost${r.changes.length === 1 ? '' : 's'} updated → Catalog (${vendor})`)
  }

  if (!result) {
    return (
      <div className="mt-2">
        <button
          onClick={run}
          className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink"
        >
          Update case costs from this doc ({vendor})
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-black/10 bg-white p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
        Price update · {result.changes.length} matched · {result.misses.length} not in catalog
      </div>
      {result.changes.length === 0 && result.misses.length === 0 && (
        <p className="text-xs text-muted">No priced lines found in this document.</p>
      )}
      {result.changes.map((c) => (
        <div key={c.name} className="flex items-baseline justify-between gap-2 border-b border-black/5 py-1 text-sm last:border-0">
          <span className="min-w-0 truncate text-ink">{c.name}</span>
          <span className="shrink-0 font-mono text-xs">
            {c.oldCost != null && <span className="text-muted">${c.oldCost.toFixed(2)} → </span>}
            <b className="text-ink">${c.newCost.toFixed(2)}</b>
            {c.pct != null && Math.abs(c.pct) >= 0.5 && (
              <span className={c.pct > 0 ? 'text-down' : 'text-up'}>
                {' '}
                {c.pct > 0 ? '▲' : '▼'}{Math.abs(c.pct).toFixed(1)}%
              </span>
            )}
          </span>
        </div>
      ))}
      {result.misses.map((m) => (
        <div key={m.name} className="flex items-center justify-between gap-2 border-b border-black/5 py-1 text-sm last:border-0">
          <span className="min-w-0 truncate text-muted">{m.name}</span>
          {addedMisses.has(m.name) ? (
            <span className="text-xs font-semibold text-up">added ✓</span>
          ) : (
            <button
              onClick={() => {
                registerItem({ name: m.name, vendor, cost: m.price })
                setAddedMisses((s) => new Set([...s, m.name]))
              }}
              className="shrink-0 rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand"
            >
              Add ${m.price.toFixed(2)}
            </button>
          )}
        </div>
      ))}
      <p className="mt-2 text-[11px] text-muted">
        Costs updated everywhere the item appears, stamped {vendor} · today.
      </p>
    </div>
  )
}

function CateringImport({ text, fileName }: { text: string; fileName: string }) {
  const [form, setForm] = useState(() => parseCatering(text, fileName))
  const [added, setAdded] = useState<'' | 'added' | 'duplicate'>('')

  const save = () => {
    if (!form.event.trim() || !form.date) return
    // Keep the full ticket text on the booking — Catering opens the actual order.
    const result = addBooking({ ...form, id: `c${Date.now()}`, event: form.event.trim(), raw: text.slice(0, 6000) })
    recordCateringImport(fileName)
    setAdded(result)
    logImport(fileName, result === 'duplicate' ? `duplicate order #${form.orderNo ?? ''} — skipped` : `booking "${form.event.trim()}" → Catering`)
  }

  if (added) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        <PartyPopper size={16} />
        {added === 'duplicate'
          ? `Already on the log (order #${form.orderNo}) — skipped`
          : 'Added to Catering — see the Catering tab'}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <CalendarPlus size={14} /> Looks like a catering order — review &amp; add
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={form.event}
          onChange={(e) => setForm({ ...form, event: e.target.value })}
          placeholder="Event / customer"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:col-span-2"
        />
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          type="time"
          value={form.time}
          onChange={(e) => setForm({ ...form, time: e.target.value })}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          type="number"
          inputMode="numeric"
          value={form.guests || ''}
          onChange={(e) => setForm({ ...form, guests: parseInt(e.target.value) || 0 })}
          placeholder="Guests"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes"
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>
      <button
        onClick={save}
        disabled={!form.event.trim() || !form.date}
        className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        Add to Catering
      </button>
      {!form.date && (
        <p className="mt-1.5 text-xs text-warn">Couldn’t read a date — please set one above.</p>
      )}
    </div>
  )
}

/** Import a dropped sales summary (Toast export) into Nightly Numbers. */
function SalesImport({ text, fileName }: { text: string; fileName: string }) {
  const rows = useMemo(() => parseSalesSummary(text), [text])
  const [added, setAdded] = useState(0)
  const ran = useRef(false)
  const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  // Owner spec: a drop IS the import — no extra button to find. Upserting by
  // date makes this safe to run on sight (same days just refresh in place).
  useEffect(() => {
    if (rows.length === 0 || ran.current) return
    ran.current = true
    const n = upsertNights(rows)
    setAdded(n)
    logImport(fileName, `${n} nights → Nightly Numbers`)
  }, [rows, fileName])

  if (rows.length === 0) return null

  const total = rows.reduce((s, r) => s + r.netSales, 0)
  return (
    <div className="mt-3 rounded-xl border border-up/30 bg-up/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-up">
        <LineChart size={16} /> Imported {added || rows.length} day{rows.length === 1 ? '' : 's'} into
        Nightly Numbers · {money(total)} net — Dashboard and Nightly are live.
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg bg-white">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-black/5 last:border-0">
                <td className="px-3 py-1.5">{r.date}</td>
                <td className="px-3 py-1.5 text-right font-mono">{money(r.netSales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Import a Toast "Sales category summary" — stores the net-sales mix so the
 *  dashboard can split any window's sales by category (labelled as an estimate,
 *  since Toast only breaks categories out per period, not per day). */
function CategoryImport({ text, fileName }: { text: string; fileName: string }) {
  const mix = useMemo(() => parseCategorySummary(text), [text])
  const ran = useRef(false)
  const [done, setDone] = useState(false)
  const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  useEffect(() => {
    if (!mix || ran.current) return
    ran.current = true
    setCatMix({ ...mix, importedAt: new Date().toISOString() })
    setDone(true)
    logImport(fileName, `sales category mix → Dashboard (${money(mix.net)} net split)`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mix, fileName])

  if (!mix) return null
  const rows = [
    ['Food', mix.food, '#E4B84C'],
    ['Liquor', mix.liquor, '#F472B6'],
    ['Beer', mix.beer, '#F0A94C'],
    ['Wine', mix.wine, '#A78BFA'],
    ['N/A bev', mix.na, '#60A5FA'],
    ['Other', mix.other, '#94A3B8'],
  ].filter(([, v]) => (v as number) > 0) as [string, number, string][]
  return (
    <div className="mt-3 rounded-xl border border-up/30 bg-up/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-up">
        <LineChart size={16} /> Category mix saved — Dashboard now splits sales by category ({money(mix.net)} net).
      </div>
      <div className="space-y-1.5 rounded-lg bg-white p-3">
        {rows.map(([label, v, color]) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 font-semibold text-ink">{label}</span>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/5">
              <div className="h-full rounded-full" style={{ width: `${(v / mix.net) * 100}%`, background: color }} />
            </div>
            <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted">
              {money(v)} · {((v / mix.net) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Import a dropped employee roster (e.g. Toast export) into Staff. */
function StaffImport({ text, fileName }: { text: string; fileName: string }) {
  const people = useMemo(() => importPeople(text), [text])
  const [added, setAdded] = useState<number | null>(null)
  if (people.length === 0) return null

  if (added !== null) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        <Users size={16} /> Added {added} of {people.length} to Staff (rest already on roster).
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Users size={14} /> Employee roster — {people.length} people detected
      </div>
      <div className="max-h-52 overflow-y-auto rounded-lg bg-white">
        <table className="w-full text-sm">
          <tbody>
            {people.slice(0, 100).map((p, i) => (
              <tr key={i} className="border-b border-black/5 last:border-0">
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="px-3 py-1.5 text-right text-xs text-muted">{p.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => { const n = addPeople(people); setAdded(n); logImport(fileName, `${n} people → Staff roster`) }}
        className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
      >
        Import {people.length} to Staff
      </button>
    </div>
  )
}

/** Inventory count sheet → load its storage areas into Inventory. Replace swaps
 *  the whole sheet; Add-new keeps current counts and only appends items not
 *  already present (matched by area + name, so the same item in two areas stays
 *  two separate lines). */
function CountSheetImport({ text, fileName }: { text: string; fileName: string }) {
  const parsed = useMemo(() => parseCountSheet(text), [text])
  const areas = useMemo(() => sheetLocations(parsed), [parsed])
  const [done, setDone] = useState<string>('')
  if (parsed.length === 0) return null

  const replaceAll = async () => {
    const cur = getCountSheet()
    if (cur.length > 0 && !(await confirmDelete(`Replace the current count sheet (${cur.length} items) with this one (${parsed.length} items)?`))) return
    setCountSheet(parsed)
    setDone(`Loaded ${parsed.length} items across ${areas.length} areas`)
    logImport(fileName, `count sheet → Inventory (replaced · ${parsed.length} items)`)
  }
  const addNew = () => {
    const cur = getCountSheet()
    const have = new Set(cur.map((it) => `${it.location.toLowerCase()}|${it.name.toLowerCase()}`))
    const fresh = parsed.filter((it) => !have.has(`${it.location.toLowerCase()}|${it.name.toLowerCase()}`))
    setCountSheet([...cur, ...fresh] as CountItem[])
    setDone(`Added ${fresh.length} new item${fresh.length === 1 ? '' : 's'} (kept existing counts)`)
    logImport(fileName, `count sheet → Inventory (added ${fresh.length} new)`)
  }

  if (done) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        <FileCheck2 size={16} /> {done} — see Inventory.
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <FileCheck2 size={14} /> Inventory count sheet — {parsed.length} items · {areas.length} areas
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <span key={a} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink">
            {a} · {parsed.filter((it) => it.location === a).length}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void replaceAll()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
          Replace inventory
        </button>
        <button onClick={addNew} className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink">
          Add new items only
        </button>
      </div>
    </div>
  )
}

/** Toast Product Mix export → load as a product-mix snapshot. It's a period
 *  total (Toast doesn't split PMIX per day), so it's dated to today as the
 *  latest period baseline; daily drops going forward supersede it. */
function PmixImport({ text, fileName }: { text: string; fileName: string }) {
  const items = useMemo(() => parsePmix(text), [text])
  const ran = useRef(false)
  const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  // Owner spec: a drop IS the import — auto-load on sight (same as the sales
  // summary), so it lands in Product Mix and ticks the daily-reports box with no
  // extra button to find.
  useEffect(() => {
    if (items.length === 0 || ran.current) return
    ran.current = true
    savePmixDay(today(), items, fileName)
    logImport(fileName, `product mix → PMIX (${items.length} items)`)
  }, [items, fileName])

  if (items.length === 0) return null
  const top = [...items].sort((a, b) => b.qty - a.qty).slice(0, 6)
  const totalQty = items.reduce((s, i) => s + i.qty, 0)

  return (
    <div className="mt-3 rounded-xl border border-up/30 bg-up/5 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-up">
        <PieChart size={16} /> Product mix imported — {items.length} items · {totalQty.toLocaleString()} sold. Product Mix is live.
      </div>
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-white p-3 sm:grid-cols-2">
        {top.map((i, n) => (
          <div key={i.name} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">
              <span className="mr-1.5 text-xs font-bold text-muted">{n + 1}</span>
              {i.name}
            </span>
            <span className="shrink-0">
              <span className="font-semibold text-ink">{i.qty}</span>
              <span className="ml-2 text-muted">{money(i.sales)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Toast "Labor cost by day" → fills real labor $ / % onto each night. Auto-
 *  applies on drop, like the sales summary. */
function LaborImport({ text, fileName }: { text: string; fileName: string }) {
  const rows = useMemo(() => parseLaborByDay(text), [text])
  const [n, setN] = useState(0)
  const ran = useRef(false)
  useEffect(() => {
    if (rows.length === 0 || ran.current) return
    ran.current = true
    const c = applyLaborRows(rows)
    setN(c)
    logImport(fileName, `labor filled for ${c} day${c === 1 ? '' : 's'} → Nightly Numbers`)
  }, [rows, fileName])
  if (rows.length === 0) return null
  const avg = rows.reduce((s, r) => s + (r.laborPct ?? 0), 0) / rows.length
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
      <ReceiptText size={16} /> Labor imported — {n || rows.length} day{(n || rows.length) === 1 ? '' : 's'} · avg{' '}
      {avg.toFixed(1)}% of net. Nightly labor is live.
    </div>
  )
}

interface DailyReport {
  id: string
  label: string
  hint: string
  match: string[]
}
const DEFAULT_DAILY_REPORTS: DailyReport[] = [
  { id: 'sales', label: 'Daily sales summary', hint: 'Toast → Sales Summary (single day)', match: ['sales summary', 'sales by day', 'category mix', 'nights →'] },
  { id: 'pmix', label: 'Product mix (PMIX)', hint: 'Toast → Product Mix', match: ['pmix', 'product mix', 'productmix'] },
  { id: 'labor', label: 'Labor report', hint: 'Toast → Labor cost by day', match: ['labor'] },
  { id: 'invoices', label: 'Invoices received', hint: 'Snap or drop each delivery', match: ['invoice', 'received', 'receiving'] },
]

/** Daily-reports tracker: one box per report, ticked when it's been dropped
 *  today (matched against the import log). Editable so the list is a record of
 *  exactly which reports need to land each day. */
function DailyReports() {
  const [reports, setReports] = usePersistentState<DailyReport[]>('reports:daily', DEFAULT_DAILY_REPORTS)
  const entries = useImportLog((s) => s.entries)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState('')
  const stored = Array.isArray(reports) ? reports : DEFAULT_DAILY_REPORTS
  // Surface any new default box (e.g. Labor) for installs made before it existed,
  // without disturbing the manager's own edits/order.
  const list = useMemo(() => {
    const missing = DEFAULT_DAILY_REPORTS.filter((d) => !stored.some((s) => s.id === d.id))
    if (missing.length === 0) return stored
    const salesIdx = stored.findIndex((s) => s.id === 'sales')
    const out = [...stored]
    out.splice(salesIdx >= 0 ? salesIdx + missing.length : out.length, 0, ...missing)
    return out
  }, [stored])

  const todayPrefix = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric' })
  const hitFor = (r: DailyReport) =>
    entries.find(
      (e) => e.at.startsWith(todayPrefix) && r.match.some((m) => `${e.file} ${e.outcome}`.toLowerCase().includes(m.toLowerCase())),
    )
  const doneCount = list.filter(hitFor).length

  const addReport = () => {
    const label = adding.trim()
    if (!label) return
    setReports([...list, { id: `r${Date.now().toString(36)}`, label, hint: 'Drop it daily', match: [label.toLowerCase()] }])
    setAdding('')
  }
  const removeReport = (id: string) => setReports(list.filter((r) => r.id !== id))

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-[0_10px_30px_-18px_rgba(23,32,55,0.18)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink">Daily reports</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-muted">{todayPrefix}</span>
        <span className={`text-xs font-bold ${doneCount === list.length ? 'text-up' : 'text-brand-600'}`}>
          {doneCount}/{list.length} in today
        </span>
        <button onClick={() => setEditing((e) => !e)} className="ml-auto text-[11px] font-semibold text-muted hover:text-brand">
          {editing ? 'Done' : 'Edit list'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => {
          const hit = hitFor(r)
          return (
            <div
              key={r.id}
              className={`flex items-start gap-2.5 rounded-xl border p-3 ${hit ? 'border-up/30 bg-up/5' : 'border-black/10 bg-black/[0.015]'}`}
            >
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${hit ? 'bg-up text-white' : 'border-2 border-dashed border-black/25 text-transparent'}`}>
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{r.label}</div>
                <div className="truncate text-[11px] text-muted">{hit ? `dropped ${hit.at}` : r.hint}</div>
              </div>
              {editing && (
                <button onClick={() => removeReport(r.id)} className="shrink-0 text-muted hover:text-down" aria-label={`Remove ${r.label}`}>
                  <CircleAlert size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addReport()}
            placeholder="Add a report to track daily…"
            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button onClick={addReport} className="rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white">
            Add
          </button>
        </div>
      )}
    </div>
  )
}
