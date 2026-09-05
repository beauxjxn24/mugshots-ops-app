import { Fragment, useEffect, useRef, useState } from 'react'
import { Printer, Paperclip, Link2, ExternalLink, X, Plus } from 'lucide-react'
import { Page } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { SIDEWORK, ROLES, phasesFor, type Role, type Section } from '../lib/sidework'
import { getCatalog, getFlags } from '../lib/catalog'
import { GuideSheet } from '../components/GuideSheet'
import { getGuideSections, type GuideShelf } from '../lib/guide'
import { SECTIONS_KEY, DEFAULTS, PHASES, type Phase, type Section as CheckSection } from '../lib/checkdue'
import { saveDoc, openDoc } from '../lib/docs'
import { SPECS, groups } from '../lib/specs'
import { builtFrom } from '../lib/linebuilds'
import type { Spec } from '../lib/types'

interface DocLink { id: string; name: string; kind: 'link' | 'file'; url?: string; docId?: string }

/**
 * Real Mugshots documents that ship in the build.
 *
 * The attach-a-file box below keeps its files in the device's own storage, so
 * a sheet attached on the office laptop is not on the tablet by the pass, and
 * a new device starts empty. Anything the whole company prints belongs here
 * instead: in the build, on every device and every store, from first load.
 */
const BUILTIN_DOCS: { name: string; note: string; href: string }[] = [
  { name: 'Application for Employment', note: '2 pages · hiring', href: 'sheets/employment-application.pdf' },
  { name: 'Mini Mugs kids menu 2026', note: '2 pages · placemat', href: 'sheets/mini-mugs-2026.pdf' },
]
const rid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

type SidworkData = Record<Role, Record<string, Section[]>>

const SHEETS = ['AM checklist', 'PM checklist', 'Weekly checklist', 'Period checklist', 'Sidework', 'Inventory count', 'Prep card', 'Produce order guide', 'US Foods order guide', 'Liquor order guide', 'Beer order guide'] as const
type Sheet = (typeof SHEETS)[number]

/** The guides that can print, in the order the list offers them. */
const GUIDE_SHEETS: GuideShelf[] = ['Produce', 'US Foods', 'Liquor', 'Beer']

/** The order guides print the same sheet, off the same component. */
const isGuideSheet = (s: Sheet): boolean => s.endsWith('order guide')
const shelfOf = (s: Sheet): GuideShelf => s.replace(' order guide', '') as GuideShelf

/** Every company prep sheet opens with these two, without exception — so a card
 *  printed from here has to as well, or it reads as a different document. */
const HYGIENE = ['Wash hands thoroughly', 'Sanitize prep area']

/**
 * Printables — a list of names. Tap one and it prints.
 *
 * This was a chip rail, a live preview and an attach-a-file panel, in that
 * order, before you reached anything printable: three decisions to get one
 * piece of paper. Nobody comes here to browse. They come because they need the
 * closing checklist in their hand, so the page is the list of things you can
 * hold, and tapping a name opens the print dialog.
 *
 * The two kinds behave the same from the outside. A generated sheet is built
 * from live data and rendered off-screen to print; a shipped PDF is printed
 * from a hidden frame. Neither shows you a preview first, because a preview is
 * a thing to look at and this page is a thing to use.
 */
export function Printables() {
  const { location } = useCurrentNames()
  /* The same key and defaults the Checklists screen uses. This used to read
     'checklists:data' — Opening / Closing / Weekly, a shape nothing has written
     in a long time — so every checklist row said "0 tasks" and printed a blank
     page. The zero was right there on screen; I put it in the list anyway. */
  const [rawChecks] = usePersistentState<Record<Phase, CheckSection[]>>(SECTIONS_KEY, DEFAULTS)
  const checkSections = (ph: Phase): CheckSection[] => (Array.isArray(rawChecks?.[ph]) ? rawChecks[ph] : DEFAULTS[ph])
  const [sidework] = usePersistentState<SidworkData>('sidework:data', SIDEWORK)
  const [specName, setSpecName] = useState('Salad Mix')
  const spec = SPECS.find((s) => s.name === specName) ?? SPECS[0]

  /** Which sheet is rendered for printing right now, if any. */
  const [job, setJob] = useState<{ sheet: Sheet; role: Role } | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)

  // Render, then print. One frame's wait, because print() reads the DOM as it
  // stands and React has not committed the sheet at the moment of the click.
  useEffect(() => {
    if (!job) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
    return () => cancelAnimationFrame(id)
  }, [job])
  // Clear once the dialog closes, so the next tap re-renders and prints again.
  useEffect(() => {
    const done = () => setJob(null)
    window.addEventListener('afterprint', done)
    return () => window.removeEventListener('afterprint', done)
  }, [])

  /**
   * Print a shipped PDF from an off-screen frame.
   *
   * The frame must be RENDERED, not `display: none`. A hidden iframe never
   * lays its document out, so Chrome had nothing to print and sent a blank
   * page — which is exactly what came out of the printer. It lives off the
   * left edge at a real page size instead (see the element at the bottom).
   *
   * The load has to finish before print() or the same blank page comes back,
   * and a PDF that never loads has to end up somewhere the person can still
   * use it, so a slow or blocked frame falls back to opening the file.
   */
  const printPdf = (href: string) => {
    const el = frame.current
    // iOS and Safari don't reliably print a PDF out of a frame — sometimes
    // nothing happens, sometimes a blank sheet. On a tablet the document
    // opens in the viewer instead, where Share → Print is one tap. Worse by
    // one tap, and it cannot silently print nothing.
    const ua = navigator.userAgent
    const shaky = /iPad|iPhone|iPod/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua))
    if (!el || shaky) return window.open(href, '_blank', 'noopener')
    let done = false
    const fallback = window.setTimeout(() => {
      if (!done) window.open(href, '_blank', 'noopener')
    }, 4000)
    el.onload = () => {
      done = true
      window.clearTimeout(fallback)
      try {
        el.contentWindow?.focus()
        el.contentWindow?.print()
      } catch {
        window.open(href, '_blank', 'noopener')
      }
    }
    el.onerror = () => {
      done = true
      window.clearTimeout(fallback)
      window.open(href, '_blank', 'noopener')
    }
    // Re-assigning the same src doesn't reload, so a second tap on the same
    // document would do nothing at all.
    el.src = ''
    el.src = href
  }

  type Row = { key: string; name: string; note: string; go: () => void; pick?: React.ReactNode }
  /* Grouped, because one flat list put eight sidework rows in the middle of it
     and buried everything else. The headings aren't controls — nothing to
     open, nothing to choose — they just let your eye skip to the right third
     of the list. */
  const groupsOfRows: Array<{ title: string; rows: Row[] }> = [
    {
      title: 'Checklists',
      rows: PHASES.map((ph) => {
        const n = checkSections(ph).reduce((a, sec) => a + sec.items.length, 0)
        return {
          key: ph,
          name: `${ph} checklist`,
          note: `${n} tasks`,
          go: () => setJob({ sheet: `${ph} checklist` as Sheet, role: 'Server' }),
        }
      }),
    },
    {
      // A name per role rather than one row plus a control you have to operate
      // first — you know whose sheet you want before you get here.
      title: 'Sidework',
      rows: ROLES.map((r) => ({
        key: `sw-${r}`,
        name: `${r} sidework`,
        note: 'duties by shift',
        go: () => setJob({ sheet: 'Sidework', role: r }),
      })),
    },
    {
      title: 'Ordering & counts',
      rows: [
        // One row per guide that has something on it. A guide this store
        // doesn't keep — Flowood buys no beer through the app — would print a
        // sheet that says "nothing here yet", which is not worth a row.
        ...GUIDE_SHEETS.map((shelf) => ({ shelf, n: getGuideSections(shelf).reduce((a, s) => a + s.ids.length, 0) }))
          .filter(({ n }) => n > 0)
          .map(({ shelf, n }) => ({
            key: `guide-${shelf}`,
            name: `${shelf} order guide`,
            note: `${n} items · with count columns`,
            go: () => setJob({ sheet: `${shelf} order guide` as Sheet, role: 'Server' }),
          })),
        {
          key: 'inventory',
          name: 'Inventory count sheet',
          note: 'blank, from your catalog',
          go: () => setJob({ sheet: 'Inventory count', role: 'Server' }),
        },
      ],
    },
    {
      title: 'Recipes',
      rows: [
        {
          key: 'prep',
          name: `Prep card — ${spec.name}`,
          note: 'pick a card, then print',
          go: () => setJob({ sheet: 'Prep card', role: 'Server' }),
          // The one row that can't be a fixed name: there are 183 cards.
          pick: (
            <select
              value={specName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSpecName(e.target.value)}
              aria-label="Which prep card"
              className="max-w-[9rem] rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-ink outline-none focus:border-brand"
            >
              {groups().map((g) => (
                <optgroup key={g} label={g}>
                  {SPECS.filter((x) => x.g === g).map((x) => (
                    <option key={x.name}>{x.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          ),
        },
      ],
    },
    {
      title: 'Documents',
      rows: BUILTIN_DOCS.map((d) => ({
        key: d.href,
        name: d.name,
        note: d.note,
        go: () => printPdf(`${import.meta.env.BASE_URL}${d.href}`),
      })),
    },
  ]

  const active = job ?? { sheet: 'AM checklist' as Sheet, role: 'Server' as Role }

  return (
    <Page title="Printables" subtitle={`Tap a name to print it · ${location}`} width="narrow" flush className="space-y-5">
      <div className="panel overflow-hidden print:hidden">
        {groupsOfRows.map((g, gi) => (
          <div key={g.title}>
            <div
              className={`bg-black/[0.04] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted ${
                gi ? 'border-t border-black/10' : ''
              }`}
            >
              {g.title}
            </div>
            {g.rows.map((r) => (
              <button
                key={r.key}
                onClick={r.go}
                className="flex w-full items-center gap-3 border-t border-black/5 px-4 py-3 text-left transition-colors hover:bg-brand/[0.06]"
              >
                <Printer size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.name}</span>
                {r.pick}
                <span className="hidden shrink-0 text-[11px] text-muted sm:block">{r.note}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Yours, and out of the way until you want it. */}
      <Documents />

      {/* Rendered only while printing — never on screen, so there is no preview
          to mistake for something you can edit. */}
      {job && (
        <div className="hidden print:block prep-print sheet-paper">
          {/* The produce guide is a wide grid with fourteen write-in columns;
              on portrait they are slivers and the rows overrun the page on any
              printer with real margins. Landscape, and only while this is the
              job — @page is global, so it is rendered into the document just
              for the moment this sheet is what's printing. */}
          {isGuideSheet(active.sheet) && <style>{'@page { size: letter landscape; margin: 10mm; }'}</style>}
          {!isGuideSheet(active.sheet) && (
            <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
              <div>
                <div className="font-display text-xl font-semibold uppercase text-ink">
                  {active.sheet === 'Sidework'
                    ? `${active.role} Sidework`
                    : active.sheet === 'Prep card'
                      ? spec.name
                      : active.sheet}
                </div>
                <div className="text-xs text-muted">{location}</div>
              </div>
              <div className="text-right text-xs text-muted">
                <div>Date: {today()}</div>
                <div className="mt-1">{active.sheet === 'Prep card' ? 'Prepped by' : 'Completed by'}: ____________</div>
              </div>
            </div>
          )}
          {active.sheet.endsWith('checklist') && (
            <SectionSheet sections={checkSections(active.sheet.replace(' checklist', '') as Phase)} />
          )}
          {active.sheet === 'Sidework' && <SideworkSheet role={active.role} data={sidework} />}
          {active.sheet === 'Inventory count' && <InventorySheet />}
          {active.sheet === 'Prep card' && <PrepCardSheet spec={spec} />}
          {isGuideSheet(active.sheet) && <GuideSheet shelf={shelfOf(active.sheet)} />}
        </div>
      )}

      {/* The frame a shipped PDF prints from. */}
      {/* The frame a shipped PDF prints from. Off-screen, NOT display:none —
          a hidden iframe never lays out, so there is nothing for the browser
          to print and the job comes out blank. Given a real page's worth of
          space so the PDF actually renders inside it, then pushed off the
          left edge where nobody sees it. print:hidden keeps it out of the
          parent's own print job. */}
      <iframe
        ref={frame}
        title="Printing"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none fixed -left-[9999px] top-0 h-[1123px] w-[794px] border-0 opacity-0 print:hidden"
      />
    </Page>
  )
}

/** Your actual documents — the real Mugshots sheets you print. Attach a PDF/
 *  photo (kept on the device) or paste a link (Google Drive, etc.); tap to open
 *  it in the native viewer, where you can print or save it. */
function Documents() {
  const [rawDocs, setDocs] = usePersistentState<DocLink[]>('printables:docs', [])
  const docs = Array.isArray(rawDocs) ? rawDocs : []
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addLink = () => {
    const n = name.trim(), u = url.trim()
    if (!u) return
    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`
    setDocs([...docs, { id: rid(), name: n || u.replace(/^https?:\/\//, '').slice(0, 40), kind: 'link', url: href }])
    setName(''); setUrl('')
  }
  const onFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const next: DocLink[] = []
    for (const f of Array.from(files)) {
      const id = rid()
      await saveDoc(id, f)
      next.push({ id, name: name.trim() || f.name, kind: 'file', docId: id })
    }
    setDocs([...docs, ...next])
    setName('')
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  const open = (d: DocLink) => {
    if (d.kind === 'link' && d.url) window.open(d.url, '_blank', 'noopener')
    else if (d.docId) void openDoc(d.docId)
  }
  const remove = (id: string) => setDocs(docs.filter((d) => d.id !== id))

  return (
    /* Shut by default. This is setup, and it was sitting above the things
       people actually came for. The shipped PDFs moved out of here into the
       print list, where they read as one more name you can tap. */
    <details className="panel px-4 py-3 print:hidden">
      <summary className="cursor-pointer text-sm font-bold text-ink">
        Add your own
        {docs.length > 0 && (
          <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-extrabold text-muted">{docs.length}</span>
        )}
        <span className="ml-2 text-xs font-normal text-muted">attach a file or paste a link — this device only</span>
      </summary>
      <p className="mb-3 mt-3 text-xs text-muted">
        Files added here live on this device. Anything the whole company prints should ship with the app instead — send it over and it lands in the list above, on every tablet in both stores.
      </p>

      {docs.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              {d.kind === 'file' ? <Paperclip size={14} className="shrink-0 text-muted" /> : <Link2 size={14} className="shrink-0 text-muted" />}
              <button onClick={() => open(d)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink hover:text-signal">
                {d.name}
              </button>
              <button onClick={() => open(d)} aria-label="Open" className="shrink-0 text-muted hover:text-signal"><ExternalLink size={15} /></button>
              <button onClick={() => remove(d.id)} aria-label="Remove" className="shrink-0 text-muted/60 hover:text-down"><X size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-40 rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addLink()}
          placeholder="Paste a link (Google Drive…)"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal"
        />
        <button onClick={addLink} disabled={!url.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Plus size={14} /> Link
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Paperclip size={14} /> {busy ? 'Saving…' : 'Attach file'}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
    </details>
  )
}

/** A checklist on paper: each section as a band, each item with a box. */
function SectionSheet({ sections }: { sections: CheckSection[] }) {
  const total = sections.reduce((a, s) => a + s.items.length, 0)
  if (total === 0) return <p className="text-sm text-muted">Nothing on this list — edit it on the Checklists screen.</p>
  return (
    <div className="space-y-3">
      {sections.map((sec) => (
        <div key={sec.title} className="break-inside-avoid">
          <div className="border-b-2 border-ink pb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink">
            {sec.title}
          </div>
          {sec.items.map((t, i) => (
            <div key={i} className="flex items-start gap-3 border-b border-black/10 py-1.5 text-[13px] leading-snug text-ink">
              <span className="mt-0.5 inline-block size-4 shrink-0 rounded border-2 border-ink/50" />
              {t}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SideworkSheet({ role, data }: { role: Role; data: SidworkData }) {
  const phases = phasesFor(role)
  return (
    <div className="space-y-5">
      {phases.map((phase) => (
        <div key={phase} className="break-inside-avoid">
          <div className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink">{phase}</div>
          {(data[role]?.[phase] ?? []).map((sec) => (
            <div key={sec.section} className="mb-2">
              <div className="text-[11px] font-bold text-muted">{sec.section}</div>
              {sec.tasks.map((t, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-black/10 py-1.5 text-[13px] text-ink">
                  <span className="inline-block size-3.5 shrink-0 rounded border-2 border-ink/50" />
                  {t}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A spec card in the company's own prep-sheet layout — the storage/yields/shelf
 * strip, an ingredients table, then numbered procedures.
 *
 * Built because salad mix has no prep sheet and never has: it sits on both line
 * checks, feeds nine builds, and the only written copy of the recipe is the card
 * in this app. Rather than making that one card a special case, any card can now
 * be printed as the sheet it should always have had.
 */
function PrepCardSheet({ spec }: { spec: Spec }) {
  // Hygiene leads on prep, not on a build sheet — a cook plating a burger is
  // already on the line, and printing "wash hands" above a build reads as filler.
  const steps = spec.g === 'Prep' ? [...HYGIENE, ...spec.steps] : spec.steps
  const feeders = builtFrom(spec.name)
    .map((n) => SPECS.find((s) => s.name === n))
    .filter((s): s is Spec => Boolean(s?.steps.length))
  const meta: [string, string][] = [
    ['Storage', spec.storage],
    ['Yields', spec.yields],
    ['Shelf life', spec.shelf],
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 border-b border-black/10 pb-3">
        {meta.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] font-extrabold uppercase tracking-wide pc-dim text-muted">{k}</div>
            <div className="text-sm font-semibold text-ink">{v || '—'}</div>
          </div>
        ))}
      </div>

      {spec.off && (
        <div className="border-l-2 border-ink/40 pl-3 text-[13px] text-ink">
          <span className="font-bold">Off the menu.</span> {spec.off}
        </div>
      )}

      <div className="break-inside-avoid">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-left text-[10px] font-extrabold uppercase tracking-wide pc-dim text-muted">
              <th className="py-1.5">Ingredients</th>
              <th className="w-40 py-1.5">Amount</th>
            </tr>
          </thead>
          <tbody>
            {spec.ing.map(([n, qty], i) => (
              <tr key={i} className="border-b border-black/10">
                <td className="py-2 text-ink">{n}</td>
                <td className="py-2 font-semibold text-ink">{qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="break-inside-avoid">
        <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide pc-dim text-muted">Procedures</div>
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-ink">
              <span className="shrink-0 font-semibold pc-dim text-muted">{i + 1})</span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      {/* Sub-recipes, pulled from their own cards rather than written out twice.
          A cook holding this sheet can work from it alone; the chopper spec
          still lives in exactly one place, so it can't drift between the two. */}
      {feeders.map((f) => (
        <div key={f.name} className="break-inside-avoid border-t border-black/10 pt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <div className="text-[10px] font-extrabold uppercase tracking-wide pc-dim text-muted">
              Made from · {f.name}
            </div>
            <div className="text-[10px] pc-dim text-muted">
              {[f.yields && `Yields ${f.yields}`, f.shelf, f.storage].filter(Boolean).join(' · ')}
            </div>
          </div>
          <ol className="space-y-1">
            {f.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[12px] leading-snug text-ink/90">
                <span className="shrink-0 font-semibold pc-dim text-muted">{i + 1})</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {/* Where the spec is written down. On most cards this names a company
          document; on salad mix it says plainly that no such document exists,
          which is the fact a manager needs when the card is questioned. */}
      <div className="border-t border-black/10 pt-2 text-[10px] pc-dim text-muted">
        {spec.doc ? `Source: ${spec.doc}` : 'Source not recorded'}
      </div>
    </div>
  )
}

/**
 * A blank count sheet for everything on the guides — the one sheet here that
 * isn't a per-shelf order guide (those all print from components/GuideSheet).
 */
function InventorySheet() {
  const items = getCatalog()
  const flags = getFlags()
  const rows = items.filter((i) => flags[i.id])
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-ink text-left text-[10px] font-extrabold uppercase tracking-wide text-muted">
          <th className="py-1.5">Item</th>
          <th className="w-24 py-1.5">Unit</th>
          <th className="w-24 py-1.5 text-center">Count</th>
        </tr>
      </thead>
      <tbody>
        {(rows.length ? rows : Array.from({ length: 20 }, () => null)).map((it, i) => (
          <tr key={i} className="border-b border-black/10">
            <td className="py-2 text-ink">{it?.name ?? ''}</td>
            <td className="py-2 text-muted">{it?.unit ?? ''}</td>
            <td className="py-2 text-center text-muted">______</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
