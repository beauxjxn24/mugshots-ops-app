import { useRef, useState } from 'react'
import { Printer, Paperclip, Link2, ExternalLink, FileText, X, Plus } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import { SIDEWORK, ROLES, phasesFor, type Role, type Section } from '../lib/sidework'
import { getCatalog, getFlags } from '../lib/catalog'
import { saveDoc, openDoc } from '../lib/docs'

interface DocLink { id: string; name: string; kind: 'link' | 'file'; url?: string; docId?: string }
const rid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

type Phase = 'Opening' | 'Closing' | 'Weekly'
type SidworkData = Record<Role, Record<string, Section[]>>

const SHEETS = ['Opening checklist', 'Closing checklist', 'Weekly checklist', 'Sidework', 'Inventory count'] as const
type Sheet = (typeof SHEETS)[number]

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

  return (
    <>
      <PageHeader
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
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6 lg:p-8">
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
        </div>

        {/* The sheet itself — plain, ink-friendly */}
        <Card className="p-6 print:border-0 print:p-0 print:shadow-none">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
            <div>
              <div className="font-display text-xl font-semibold text-ink">
                {sheet === 'Sidework' ? `${role} Sidework` : sheet}
              </div>
              <div className="text-xs text-muted">{location}</div>
            </div>
            <div className="text-right text-xs text-muted">
              <div>Date: {today()}</div>
              <div className="mt-1">Completed by: ____________</div>
            </div>
          </div>

          {sheet.endsWith('checklist') && (
            <CheckSheet tasks={checkData[sheet.replace(' checklist', '') as Phase] ?? []} />
          )}
          {sheet === 'Sidework' && <SideworkSheet role={role} data={sidework} />}
          {sheet === 'Inventory count' && <InventorySheet />}
        </Card>
      </div>
    </>
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
