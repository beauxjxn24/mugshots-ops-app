import { useRef, useState } from 'react'
import { Printer, Paperclip, Link2, ExternalLink, FileText, X, Plus } from 'lucide-react'
import { Page, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { SIDEWORK, ROLES, phasesFor, type Role, type Section } from '../lib/sidework'
import { getCatalog, getFlags, getPars } from '../lib/catalog'
import { getGuideSections } from '../lib/guide'
import { saveDoc, openDoc } from '../lib/docs'
import { SPECS, groups } from '../lib/specs'
import { builtFrom } from '../lib/linebuilds'
import type { Spec } from '../lib/types'

interface DocLink { id: string; name: string; kind: 'link' | 'file'; url?: string; docId?: string }
const rid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

type Phase = 'Opening' | 'Closing' | 'Weekly'
type SidworkData = Record<Role, Record<string, Section[]>>

const SHEETS = ['Opening checklist', 'Closing checklist', 'Weekly checklist', 'Sidework', 'Inventory count', 'Prep card', 'Produce order guide'] as const
type Sheet = (typeof SHEETS)[number]

/** Every company prep sheet opens with these two, without exception — so a card
 *  printed from here has to as well, or it reads as a different document. */
const HYGIENE = ['Wash hands thoroughly', 'Sanitize prep area']

/**
 * Printables (handoff spec) — clean black-and-white sheets straight from your
 * live data: checklists, sidework duty sheets by role, and a blank inventory
 * count sheet. Pick a sheet, hit print.
 */
export function Printables() {
  const { location } = useCurrentNames()
  const [sheet, setSheet] = useState<Sheet>('Opening checklist')
  const [role, setRole] = useState<Role>('Server')
  const [checkData] = usePersistentState<Record<Phase, string[]>>('checklists:data', {
    Opening: [],
    Closing: [],
    Weekly: [],
  })
  const [sidework] = usePersistentState<SidworkData>('sidework:data', SIDEWORK)
  // Salad mix is the reason this sheet exists, so it is what opens.
  const [specName, setSpecName] = useState('Salad Mix')
  const spec = SPECS.find((s) => s.name === specName) ?? SPECS[0]

  return (
      <Page
        title="Printables"
        subtitle="Print-ready sheets from your live data"
        right={
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white print:hidden"
          >
            <Printer size={15} /> Print
          </button>
        }
        width="narrow"
        flush
        className="space-y-4"
      >
        {/* Your real Mugshots documents — link or attach the actual files */}
        <Documents />

        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted print:hidden">
          Generate a sheet from live data
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {SHEETS.map((s) => (
            <button
              key={s}
              onClick={() => setSheet(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                sheet === s ? 'border-brand bg-brand text-white' : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {s}
            </button>
          ))}
          {sheet === 'Sidework' && (
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          )}
          {sheet === 'Prep card' && (
            <select
              value={specName}
              onChange={(e) => setSpecName(e.target.value)}
              className="min-w-0 max-w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand"
            >
              {groups().map((g) => (
                <optgroup key={g} label={g}>
                  {SPECS.filter((s) => s.g === g).map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>

        {/* The sheet itself — plain, ink-friendly */}
        {/* A prep card is going on a wall, so on paper it owns the page: the
            same .prep-print contract the count sheet uses drops the app's page
            header and strips the dark shell's backgrounds. .prep-card then puts
            the ink back — this sheet is built from the app's own text classes,
            and text-ink is #e9eef6, which prints as nothing. */}
        <Card
          className={`p-6 print:border-0 print:p-0 print:shadow-none ${
            sheet === 'Prep card' || sheet === 'Produce order guide' ? 'prep-print prep-card' : ''
          }`}
        >
          {sheet !== 'Produce order guide' && (
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
            <div>
              <div className="font-display text-xl font-semibold uppercase text-ink">
                {sheet === 'Sidework' ? `${role} Sidework` : sheet === 'Prep card' ? spec.name : sheet}
              </div>
              <div className="text-xs text-muted">{location}</div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>Date: {today()}</div>
              <div className="mt-1">{sheet === 'Prep card' ? 'Prepped by' : 'Completed by'}: ____________</div>
            </div>
          </div>
          )}

          {sheet.endsWith('checklist') && (
            <CheckSheet tasks={checkData[sheet.replace(' checklist', '') as Phase] ?? []} />
          )}
          {sheet === 'Sidework' && <SideworkSheet role={role} data={sidework} />}
          {sheet === 'Inventory count' && <InventorySheet />}
          {sheet === 'Prep card' && <PrepCardSheet spec={spec} />}
          {sheet === 'Produce order guide' && <ProduceGuideSheet />}
        </Card>
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
    <div className="rounded-2xl border border-signal/20 bg-gradient-to-b from-signal/[0.06] to-transparent p-4 print:hidden">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-signal">
        <FileText size={13} /> Your documents
      </div>
      <p className="mb-3 text-xs text-muted">Attach the real sheets you print, or paste a link to them. Tap one to open it and print or save.</p>

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
    </div>
  )
}

function CheckSheet({ tasks }: { tasks: string[] }) {
  if (tasks.length === 0) return <p className="text-sm text-muted">No tasks — edit the checklist on the Checklists screen.</p>
  return (
    <div className="space-y-0.5">
      {tasks.map((t, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-black/10 py-2 text-sm text-ink">
          <span className="inline-block size-4 shrink-0 rounded border-2 border-ink/50" />
          {t}
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
 * The produce order guide, printed as the paper one: a green title band, the
 * four printed columns, then a run of empty boxes to write counts into.
 *
 * The blank grid is the point. This sheet gets carried into the walk-in and
 * counted on over and over — one column per count — so the printed part is
 * only the left third and the rest of the page has to be somewhere to write.
 * Items and pars come from this store's live guide, so a par changed in the
 * app is on the next sheet off the printer.
 */
const TALLY_COLS = 14

function ProduceGuideSheet() {
  const pars = getPars()
  const byId = new Map(getCatalog().map((c) => [c.id, c]))
  const rows = getGuideSections('Produce')
    .flatMap((sec) => sec.ids)
    .flatMap((id) => {
      const ci = byId.get(id)
      if (!ci) return []
      const p = pars[id] ?? { par: 0, onHand: 0 }
      return [{ name: ci.name, size: ci.size ?? '', m: p.par, f: p.parF }]
    })

  const num = (v?: number) => (typeof v === 'number' ? String(v) : '')

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Nothing on the produce guide yet — add items on the Orders screen.
      </p>
    )
  }

  return (
    <div className="produce-guide">
      <div className="pg-band border-2 px-3 py-2 text-center">
        <span className="font-display text-xl font-bold tracking-wide text-ink">Produce Order Guide</span>
      </div>
      <div className="overflow-x-auto">
        <table className="pg-table w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="pg-band pg-w-name border px-1.5 py-1 text-left font-bold uppercase">Product</th>
              <th className="pg-band pg-w-size border px-1.5 py-1 text-left font-bold uppercase">Size</th>
              <th className="pg-band pg-w-par border px-1 py-1 text-center font-bold uppercase">M-Par</th>
              <th className="pg-band pg-w-par border px-1 py-1 text-center font-bold uppercase">F-Par</th>
              {/* Undated on purpose — whoever counts writes the date in. */}
              {Array.from({ length: TALLY_COLS }, (_, i) => (
                <th key={i} className="border border-black/40 px-0 py-1" />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="border border-black/60 px-1.5 py-[3px] font-medium">{r.name}</td>
                <td className="border border-black/60 px-1.5 py-[3px]">{r.size}</td>
                <td className="border border-black/60 px-1 py-[3px] text-center tabular-nums">{num(r.m)}</td>
                <td className="border border-black/60 px-1 py-[3px] text-center tabular-nums">{num(r.f)}</td>
                {Array.from({ length: TALLY_COLS }, (_, i) => (
                  <td key={i} className="border border-black/40 px-0 py-[3px]" />
                ))}
              </tr>
            ))}
            {/* Spare lines, because a new item turns up before a new sheet does. */}
            {Array.from({ length: 4 }, (_, i) => (
              <tr key={`blank${i}`}>
                {Array.from({ length: 4 + TALLY_COLS }, (_, c) => (
                  <td key={c} className={`border px-1 py-[3px] ${c < 4 ? 'border-black/60' : 'border-black/40'}`}>
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
