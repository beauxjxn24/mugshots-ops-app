import { useRef, useState } from 'react'
import { confirmDelete } from '../lib/confirm'
import { Upload, Users } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'
import { type Person, ROLES, newId, importPeople } from '../lib/staff'

export function Staff() {
  const [staff, setStaff] = usePersistentState<Person[]>('staff:list', [])
  const [form, setForm] = useState({ name: '', role: 'Server', phone: '' })
  const [showImport, setShowImport] = useState(false)

  const add = () => {
    if (!form.name.trim()) return
    setStaff((s) => [...s, { ...form, id: newId(), name: form.name.trim() }])
    setForm({ name: '', role: 'Server', phone: '' })
  }

  // Add many, skipping names already on the roster (case-insensitive).
  const bulkAdd = (people: ReturnType<typeof importPeople>): number => {
    let added = 0
    setStaff((s) => {
      const have = new Set(s.map((p) => p.name.toLowerCase()))
      const fresh = people
        .filter((p) => p.name && !have.has(p.name.toLowerCase()))
        .map((p) => ({ ...p, id: newId() }))
      added = fresh.length
      return [...s, ...fresh]
    })
    return added
  }

  const byRole = ROLES.map((r) => ({ role: r, people: staff.filter((p) => p.role === r) })).filter(
    (g) => g.people.length > 0,
  )

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={`${staff.length} team member${staff.length === 1 ? '' : 's'} · your roster`}
        right={
          <button
            onClick={() => setShowImport((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
              showImport ? 'bg-brand text-white' : 'border border-black/10 bg-white text-ink'
            }`}
          >
            <Upload size={15} /> Import list
          </button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        {showImport && <ImportPanel onImport={bulkAdd} />}

        {/* Add one */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Full name"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Phone (optional)"
              className="w-40 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              Add
            </button>
          </div>
        </Card>

        {staff.length === 0 && !showImport && (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
              <Users size={24} />
            </div>
            <p className="text-sm text-muted text-pretty">
              Add your team once here — Tipshare and other screens pull from this roster, so you
              never re-enter a name. Use <b>Import list</b> to paste a Toast employee export.
            </p>
          </Card>
        )}

        {byRole.map((g) => (
          <div key={g.role}>
            <div className="mb-1.5 px-1 text-xs font-extrabold uppercase tracking-wide text-muted">
              {g.role} · {g.people.length}
            </div>
            <Card className="divide-y divide-black/5">
              {g.people.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{p.name}</div>
                    {p.phone && <div className="text-xs text-muted">{p.phone}</div>}
                  </div>
                  <button
                    onClick={async () => { if (await confirmDelete(`Remove ${p.name} from the roster?`)) setStaff((s) => s.filter((x) => x.id !== p.id)) }}
                    aria-label={`Remove ${p.name}`}
                    className="text-muted hover:text-down"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </>
  )
}

function ImportPanel({ onImport }: { onImport: (p: ReturnType<typeof importPeople>) => number }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const preview = text.trim() ? importPeople(text) : []

  const run = () => {
    const people = importPeople(text)
    const added = onImport(people)
    setMsg(`Added ${added} of ${people.length} (skipped ${people.length - added} already on roster).`)
    setText('')
  }

  return (
    <Card className="border-brand/30 bg-brand/5 p-4">
      <div className="mb-2 text-sm font-semibold text-ink">Import your team</div>
      <p className="mb-3 text-xs text-muted text-pretty">
        Paste a list (one per line, or “Name, Role”) — or upload a <b>Toast employee export</b> (CSV).
        Names and job titles map to roles automatically. Duplicates are skipped.
      </p>
      <div className="mb-2 flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-ink"
        >
          <Upload size={14} /> Choose CSV file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setText(await f.text())
          }}
        />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={'Jane Smith, Server\nMarcus Lee, Bartender\n…or paste the Toast CSV here'}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {preview.length > 0 ? `${preview.length} people detected` : msg || ' '}
        </span>
        <button
          onClick={run}
          disabled={preview.length === 0}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Import {preview.length || ''} {preview.length === 1 ? 'person' : 'people'}
        </button>
      </div>
    </Card>
  )
}

function initials(n: string): string {
  const parts = n.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || n.slice(0, 2).toUpperCase()
}
