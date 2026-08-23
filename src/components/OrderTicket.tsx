// A catering order, opened over the log — the caterer's own sheet, ready to print.
//
// Tapping an order used to unfold a panel UNDER its row: our reading of the
// ticket first, then the details, and the actual PDF last, in a box a quarter
// of the screen tall. The one thing a manager opens an order for — print the
// sheet and put it on the line — was the furthest thing down.
//
// So the order opens as itself. Full screen, the caterer's page filling it,
// Print in the header.
//
// ── When the PDF isn't here ───────────────────────────────────────────────────
//
// The file lives in IndexedDB on the device that imported it, and IndexedDB
// travels no better than localStorage does — an order dropped on the office
// computer has no PDF on the closing manager's phone. That is not a reason for
// a dead button: the ticket text was kept on the booking, so the app prints its
// own sheet from that instead, and says plainly which one you're looking at.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, ExternalLink, FileText, ScrollText } from 'lucide-react'
import { getDoc } from '../lib/docs'
import { fmtDate, fmtTime, type Booking } from '../lib/catering'
import { mapItems, unmapped } from '../lib/ezmap'
import { useScope } from '../lib/scope'

const money = (n: number) => `$${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function OrderTicket({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
  const docId = booking?.docId
  const [url, setUrl] = useState<string | null>(null)
  const [doc, setDoc] = useState<'looking' | 'here' | 'gone'>('looking')
  const [view, setView] = useState<'pdf' | 'details'>('pdf')
  const frame = useRef<HTMLIFrameElement>(null)
  const concepts = useScope((s) => s.concepts)
  const conceptId = useScope((s) => s.currentConcept)
  const locId = useScope((s) => s.currentLocation)

  // Opening a different order always starts on the PDF again.
  useEffect(() => setView('pdf'), [booking?.id])

  useEffect(() => {
    if (!docId) {
      setUrl(null)
      setDoc('gone')
      return
    }
    let cancelled = false
    let made = ''
    setDoc('looking')
    setUrl(null)
    void getDoc(docId).then((rec) => {
      if (cancelled) return
      if (!rec) return setDoc('gone')
      made = URL.createObjectURL(rec.blob)
      setUrl(made)
      setDoc('here')
    })
    return () => {
      cancelled = true
      // Revoked late on purpose: closing the dialog must not pull the file out
      // from under a tab that was opened from it and is still loading.
      if (made) setTimeout(() => URL.revokeObjectURL(made), 60_000)
    }
  }, [docId])

  useEffect(() => {
    if (!booking) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [booking, onClose])

  if (!booking) return null
  const b = booking

  const concept = concepts.find((c) => c.id === conceptId)
  const where = [concept?.name, concept?.locations.find((l) => l.id === locId)?.name]
    .filter(Boolean)
    .join(' · ')

  const showingPdf = doc === 'here' && view === 'pdf'
  const openTab = () => {
    if (url) window.open(url, '_blank', 'noopener')
  }
  const print = () => {
    if (showingPdf) {
      try {
        const w = frame.current?.contentWindow
        if (w) {
          w.focus()
          w.print()
          return
        }
      } catch {
        /* the viewer blocked scripted printing — hand it to a tab instead */
      }
      return openTab()
    }
    window.print()
  }

  return createPortal(
    <div
      className="order-dialog fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Catering order — ${b.event}`}
    >
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="order-panel relative flex h-[93dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[90dvh] sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-black/5 p-4 print:hidden">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
              Catering order
            </div>
            <div className="truncate font-display text-base font-semibold text-ink">{b.event}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="font-semibold text-ink">
                {fmtDate(b.date)}
                {b.time && ` · ${fmtTime(b.time)}`}
              </span>
              {b.guests > 0 && <span>{b.guests} guests</span>}
              {b.orderNo && <span className="font-mono font-bold">#{b.orderNo}</span>}
              {b.source && (
                <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-brand-600">
                  {b.source}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={print}
              disabled={doc === 'looking'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              <Printer size={13} /> Print
            </button>
            {doc === 'here' && (
              <button
                onClick={openTab}
                aria-label="Open the order PDF in a new tab"
                title="Open in a new tab"
                className="grid size-9 place-items-center rounded-lg border border-black/10 bg-white text-ink"
              >
                <ExternalLink size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Both readings are here when both exist — the caterer's page is what
            prints for the kitchen, ours is what carries the deposit and the
            notes a manager typed on. */}
        {doc === 'here' && (b.raw || b.notes) && (
          <div className="flex gap-1 border-b border-black/5 px-4 py-2 print:hidden">
            <Tab on={view === 'pdf'} onClick={() => setView('pdf')} icon={<FileText size={12} />}>
              Order PDF
            </Tab>
            <Tab on={view === 'details'} onClick={() => setView('details')} icon={<ScrollText size={12} />}>
              Details
            </Tab>
          </div>
        )}

        {showingPdf ? (
          <iframe
            ref={frame}
            src={url ?? ''}
            title={`Catering order — ${b.event}`}
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        ) : doc === 'looking' ? (
          <p className="p-6 text-center text-sm text-muted">Opening the order…</p>
        ) : (
          <div className="order-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {docId && doc === 'gone' && (
              <p className="mb-3 rounded-lg border border-brand/30 bg-brand/[0.07] p-3 text-xs leading-relaxed text-ink/80 print:hidden">
                The caterer’s PDF isn’t on this device — the file stays on whichever device imported
                it. Below is the order as it was read in, and it prints. To print the caterer’s own
                page here, re-drop the PDF on Imports.
              </p>
            )}
            <OrderPaper b={b} where={where} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Tab({
  on,
  onClick,
  icon,
  children,
}: {
  on: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
        on ? 'bg-brand/15 text-brand-600' : 'text-muted hover:bg-black/5'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

// Declared above the sheet that uses them: these are `const` arrows, so a
// reference from earlier in the module would hit the temporal dead zone.
const Head = ({ children }: { children: React.ReactNode }) => (
  <div className="op-quiet mb-1.5 mt-4 text-[10px] font-extrabold uppercase tracking-wider text-muted">
    {children}
  </div>
)

const Fact = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div>
    <div className="op-quiet text-[9px] font-extrabold uppercase tracking-wider text-muted">{k}</div>
    <div className="text-sm font-bold leading-snug text-ink">{children}</div>
  </div>
)

/**
 * The order on our own paper — what prints when the caterer's PDF isn't here.
 *
 * Everything the import kept: the header facts, the notes it unpacked, and the
 * ticket text verbatim underneath, because the app's reading of an order is a
 * summary and the kitchen needs the line items.
 */
function OrderPaper({ b, where }: { b: Booking; where: string }) {
  const lines = (b.notes || '')
    .split(/\s·\s/)
    .map((s) => s.trim())
    .filter(Boolean)
  return (
    <div className="order-print mx-auto w-full max-w-2xl">
      <div className="op-rule flex items-end justify-between gap-4 border-b-2 border-ink/70 pb-2">
        <div className="min-w-0">
          <div className="op-quiet text-[10px] font-extrabold uppercase tracking-wider text-muted">
            Catering order{where && ` · ${where}`}
          </div>
          <div className="font-display text-lg font-bold leading-tight text-ink">{b.event}</div>
        </div>
        {b.orderNo && <div className="shrink-0 font-mono text-sm font-bold text-ink">#{b.orderNo}</div>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact k="When">
          {fmtDate(b.date) || '—'}
          {b.time && (
            <>
              <br />
              {fmtTime(b.time)}
            </>
          )}
        </Fact>
        <Fact k="Guests">{b.guests || '—'}</Fact>
        <Fact k="Deposit">
          {b.deposit != null ? `${money(b.deposit)} ${b.depositPaid ? 'paid' : 'pending'}` : '—'}
        </Fact>
        <Fact k="Estimate">{b.estimate != null ? money(b.estimate) : '—'}</Fact>
      </div>

      {b.items && b.items.length > 0 && (
        <>
          <Head>What was ordered</Head>
          <div className="overflow-hidden rounded-lg border border-ink/20">
            {mapItems(b.items).map((it, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-ink/10 px-2.5 py-1.5 text-sm last:border-0"
              >
                <span className="font-mono font-bold text-ink">{it.qty}×</span>
                <span className="min-w-0 flex-1 font-semibold text-ink">{it.name}</span>
                {it.build && it.build !== it.name && (
                  <span className="op-quiet text-[11px] text-muted">pack: {it.build}</span>
                )}
                {it.special && (
                  <span className="w-full text-[11px] font-semibold text-brand-600">
                    ⚑ {it.special}
                  </span>
                )}
              </div>
            ))}
          </div>
          {unmapped(b.items).length > 0 && (
            <p className="op-quiet mt-1 text-[11px] text-muted">
              Not matched to a build card yet: {unmapped(b.items).map((i) => i.name).join(', ')}
            </p>
          )}
        </>
      )}

      {lines.length > 0 && (
        <>
          <Head>Notes</Head>
          <ul className="space-y-1">
            {lines.map((l, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm text-ink/85">
                {/* A character, not a styled dot — print forces backgrounds
                    transparent, and a background-only bullet vanishes. */}
                <span className="shrink-0 text-muted">•</span>
                {l}
              </li>
            ))}
          </ul>
        </>
      )}

      {b.raw && (
        <>
          <Head>The order as it came in</Head>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink/85">
            {b.raw}
          </pre>
        </>
      )}

      {lines.length === 0 && !b.raw && (
        <p className="mt-4 text-sm text-muted">
          Nothing else was captured on this booking — edit it on the log, or drop the order PDF on
          Imports.
        </p>
      )}
    </div>
  )
}
