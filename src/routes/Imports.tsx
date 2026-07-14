import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Camera, CloudUpload, FileCheck2, CircleAlert, Loader2 } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { today } from '../lib/store'
import { readFile, type ReadResult, type LineItem } from '../lib/reader'
import { getOrdering, proposeReceipts, applyReceipts, setParEntry, vendors, type Receipt } from '../lib/ordering'
import { updatePrices, registerItem, addAlias, setItemCost, setOnGuide } from '../lib/catalog'
import { addInvoice, parseInvoice } from '../lib/invoices'
import { isCateringDoc, parseCatering, addBooking, recordCateringImport } from '../lib/catering'
import { isSalesSummary, parseSalesSummary, upsertNights } from '../lib/nightly'
import { isRosterDoc, importPeople, addPeople } from '../lib/staff'
import { logImport, useImportLog } from '../lib/importlog'
import { saveDoc } from '../lib/docs'
import { confirmDelete } from '../lib/confirm'
import { CalendarPlus, PartyPopper, LineChart, Users } from 'lucide-react'

interface Job extends Partial<ReadResult> {
  id: string
  fileName: string
  status: 'reading' | 'done' | 'error'
  progress: number
  /** IndexedDB id of the original document — invoices link back to it. */
  docId?: string
}

const money2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

let seq = 0

export function Imports() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const recentDrops = useRef<Map<string, number>>(new Map())

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
    // through the same reader, so a dropped .zip "just works".
    const list: File[] = []
    for (const file of fresh) {
      if (/\.zip$/i.test(file.name) || /zip/.test(file.type)) {
        try {
          const { unzipSync } = await import('fflate')
          const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
          for (const [path, bytes] of Object.entries(entries)) {
            const name = path.split('/').pop() ?? path
            if (!name || path.endsWith('/') || path.includes('__MACOSX') || name.startsWith('.')) continue
            list.push(new File([bytes.slice().buffer as ArrayBuffer], name))
          }
          continue
        } catch {
          /* fall through — the reader reports it honestly */
        }
      }
      list.push(file)
    }
    for (const file of list) {
      const id = `j${++seq}`
      const docId = `doc${Date.now().toString(36)}${seq}`
      void saveDoc(docId, file) // keep the original — invoices reopen it
      setJobs((j) => [{ id, fileName: file.name, status: 'reading', progress: 0, docId }, ...j])
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
        const detected = isSalesSummary(res.text)
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
    }
  }, [])

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
        {/* Catch-up import — the prototype Admin's first-time-setup recipe */}
        <details className="rounded-2xl border border-brand/25 bg-brand/[0.06] px-4 py-3">
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

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            drag ? 'border-brand bg-brand/10' : 'border-black/15 bg-white/60 hover:border-brand/50'
          }`}
        >
          <div className="mb-3 flex items-center justify-center gap-3 text-brand">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand/10">
              <FileText size={22} />
            </span>
            <span className="grid size-12 place-items-center rounded-2xl bg-brand/10">
              <Camera size={22} />
            </span>
            <span className="grid size-12 place-items-center rounded-2xl bg-brand/10">
              <CloudUpload size={22} />
            </span>
          </div>
          <div className="mt-2 font-display text-lg font-semibold text-ink">
            Drop files here, or tap to choose
          </div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted text-pretty">
            PDFs are read instantly. Photos of invoices are read with on-device OCR — snap a picture
            of a US Foods or Gulf Coast delivery ticket and drop it in.
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
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          {/* Camera-only path, offered as an explicit second button. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
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
                ) : (
                  <>
                    <CircleAlert size={12} /> Error
                  </>
                )}
              </span>
            </div>

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

            {job.text && isRosterDoc(job.text) && <StaffImport text={job.text} fileName={job.fileName} />}

            {job.text && isSalesSummary(job.text) && <SalesImport text={job.text} fileName={job.fileName} />}

            {job.text && isCateringDoc(job.text) && (
              <CateringImport text={job.text} fileName={job.fileName} />
            )}

            {/* Invoices/deliveries (lines with quantities) → one-tap receiving.
                Price sheets (prices but no quantities) → price update only. */}
            {job.lineItems && job.lineItems.length > 0 && job.lineItems.some((li) => li.qty) && (
              <Receiving lineItems={job.lineItems} fileName={job.fileName} text={job.text ?? ''} docId={job.docId} />
            )}
            {job.lineItems && job.lineItems.length > 0 && !job.lineItems.some((li) => li.qty) && job.text && (
              <PriceUpdate lineItems={job.lineItems} text={job.text} fileName={job.fileName} />
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
  description: string
  qty: number
  price?: number // case cost from the invoice line — carried into the catalog
  code?: string // vendor item code split off the name
  size?: string // pack size split off the name (750ml, 4/5LB…)
  // '' = skip, 'NEW' = add to the guide as a new item, otherwise "vendor||itemId"
  target: string
}

/**
 * Receiving (owner spec): NOT tied to an order. The invoice comes in, the
 * table shows item · size · qty · price, and ONE button logs the received
 * quantities, updates pricing everywhere, and files the invoice.
 */
function Receiving({ lineItems, fileName, text, docId }: { lineItems: LineItem[]; fileName: string; text: string; docId?: string }) {
  const [applied, setApplied] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>(() =>
    proposeReceipts(lineItems).map((p) => ({
      description: p.description,
      qty: p.qty,
      price: p.price,
      code: p.code,
      size: p.size,
      target: p.match ? `${p.match.vendor}||${p.match.item.id}` : 'NEW',
    })),
  )
  const inv = useMemo(() => parseInvoice(text, fileName), [text, fileName])
  const vendorList = useMemo(() => vendors(), [])
  const [vendor, setVendor] = useState(inv.vendor && inv.vendor !== 'Vendor' ? inv.vendor : (vendorList[0] ?? 'US Foods'))

  const options = useMemo(() => {
    const data = getOrdering()
    return Object.entries(data).flatMap(([v, items]) => items.map((it) => ({ v, id: it.id, label: it.name })))
  }, [])

  const matched = rows.filter((r) => r.target && r.target !== 'NEW').length
  const toAdd = rows.filter((r) => r.target === 'NEW').length

  const apply = () => {
    const matchedRows = rows.filter((r) => r.target && r.target !== 'NEW')
    const receipts: Receipt[] = matchedRows
      .filter((r) => r.qty > 0)
      .map((r) => {
        const [v, itemId] = r.target.split('||')
        return { vendor: v, itemId, qty: r.qty }
      })
    const updated = applyReceipts(receipts)
    let repriced = 0
    for (const r of matchedRows) {
      const itemId = r.target.split('||')[1]
      addAlias(itemId, r.description)
      if (r.price && r.price > 0) {
        setItemCost(itemId, r.price, vendor)
        repriced++
      }
    }
    let added = 0
    rows.filter((r) => r.target === 'NEW').forEach((r) => {
      // registerItem de-dupes by name AND alias — the catalog never doubles up.
      const ci = registerItem({ name: r.description, unit: 'cs', vendor, cost: r.price, code: r.code, size: r.size })
      setOnGuide(ci.id, true)
      setParEntry(ci.id, { onHand: Math.max(0, r.qty) })
      added++
    })
    // File the invoice automatically — qty, price, date, done.
    if (inv.total > 0) {
      addInvoice({
        id: `inv${Date.now()}`,
        vendor,
        date: inv.date ?? today(),
        number: inv.number,
        total: inv.total,
        paid: false,
        docId,
      })
    }
    const summary = `${updated + added} received${repriced ? ` · ${repriced} price${repriced === 1 ? '' : 's'} updated` : ''}${added ? ` · ${added} new → Catalog` : ''}${inv.total > 0 ? ` · invoice ${money2(inv.total)} filed` : ''}`
    setApplied(summary)
    logImport(fileName, summary)
  }

  if (applied) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        ✓ {applied}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          Received · {rows.length} lines{inv.date ? ` · ${inv.date}` : ''}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink/70">
          Vendor
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
          >
            {[...new Set([vendor, ...vendorList])].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,2fr)_72px_52px_72px_minmax(110px,1fr)] gap-1.5 border-b border-black/10 pb-1 text-[9px] font-extrabold uppercase tracking-wide text-muted">
        <span>Item</span>
        <span>Size</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Price</span>
        <span className="text-right">Goes to</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_72px_52px_72px_minmax(110px,1fr)] items-center gap-1.5 border-b border-black/5 py-1.5 last:border-0">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{r.description}</span>
            {r.code && <span className="block font-mono text-[9px] text-muted">{r.code}</span>}
          </span>
          <span className="truncate text-xs text-muted">{r.size ?? '—'}</span>
          <input
            type="number"
            inputMode="numeric"
            value={r.qty}
            onChange={(e) =>
              setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Math.max(0, parseInt(e.target.value) || 0) } : x)))
            }
            className="w-full rounded-lg border border-black/10 bg-white px-1 py-1 text-center text-sm outline-none focus:border-brand"
          />
          <span className="text-right font-mono text-xs text-ink">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</span>
          <select
            value={r.target}
            onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))}
            className={`w-full rounded-lg border bg-white px-1.5 py-1 text-[11px] outline-none focus:border-brand ${
              r.target === 'NEW' ? 'border-brand/40 font-semibold text-brand-600' : 'border-black/10'
            }`}
          >
            <option value="">— skip —</option>
            <option value="NEW">➕ new item</option>
            {options.map((o) => (
              <option key={o.v + o.id} value={`${o.v}||${o.id}`}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        onClick={apply}
        disabled={matched + toAdd === 0}
        className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
      >
        Log received + update prices{inv.total > 0 ? ` + file invoice ${money2(inv.total)}` : ''} ✓
      </button>
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
  const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  if (rows.length === 0) return null

  if (added > 0) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-up/30 bg-up/5 p-3 text-sm font-semibold text-up">
        <LineChart size={16} /> Imported {added} day{added === 1 ? '' : 's'} into Nightly Numbers — the
        Dashboard is now live.
      </div>
    )
  }

  const total = rows.reduce((s, r) => s + r.netSales, 0)
  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <LineChart size={14} /> Sales summary — {rows.length} days · {money(total)} net
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
      <button
        onClick={() => { const n = upsertNights(rows); setAdded(n); logImport(fileName, `${n} nights → Nightly Numbers`) }}
        className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
      >
        Import {rows.length} days into Nightly Numbers
      </button>
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
