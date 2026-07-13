import { useMemo, useState } from 'react'
import { ChevronDown, Mail, Check } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState, today } from '../lib/store'
import { useCurrentNames } from '../lib/scope'
import type { Night } from '../lib/nightly'
import { DEFAULT_TARGETS, TARGETS_KEY, type Targets } from '../lib/targets'
import { DEFAULT_USERS, type User } from '../lib/users'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const money2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Form = {
  date: string
  gross: string
  rewards: string
  promos: string
  comps: string
  staffDisc: string
  labor: string
  deposit: string
  overUnder: string
  covers: string
  notes: string
  food: string
  beer: string
  liquor: string
  wine: string
  na: string
}
const EMPTY: Form = {
  date: today(), gross: '', rewards: '', promos: '', comps: '', staffDisc: '',
  labor: '', deposit: '', overUnder: '', covers: '', notes: '',
  food: '', beer: '', liquor: '', wine: '', na: '',
}
const f = (s: string) => parseFloat(s) || 0

/**
 * Nightly Numbers — the prototype's close-out math, ported:
 * gross − (rewards + promos + comps + staff) = net · labor$ → labor % of net
 * (flagged against the store's target) · deposit over/under.
 */
export function Nightly() {
  const [log, setLog] = usePersistentState<Night[]>('nightly:log', [])
  const [targets] = usePersistentState<Targets>(TARGETS_KEY, DEFAULT_TARGETS)
  const [form, setForm] = useState<Form>(EMPTY)
  const [showCats, setShowCats] = useState(false)

  const discounts = f(form.rewards) + f(form.promos) + f(form.comps) + f(form.staffDisc)
  const net = Math.max(0, f(form.gross) - discounts)
  const laborPct = net > 0 && f(form.labor) > 0 ? (f(form.labor) / net) * 100 : 0

  const sorted = useMemo(() => [...log].sort((a, b) => b.date.localeCompare(a.date)), [log])
  const weekTotal = useMemo(() => sorted.slice(0, 7).reduce((s, n) => s + n.netSales, 0), [sorted])

  const save = () => {
    if (!form.date || (f(form.gross) === 0 && net === 0)) return
    const n: Night = {
      id: `n${Date.now()}`,
      date: form.date,
      netSales: net,
      deposit: f(form.deposit),
      covers: parseInt(form.covers) || 0,
      notes: form.notes.trim(),
      gross: f(form.gross) || undefined,
      rewards: f(form.rewards) || undefined,
      promos: f(form.promos) || undefined,
      comps: f(form.comps) || undefined,
      staffDisc: f(form.staffDisc) || undefined,
      labor: f(form.labor) || undefined,
      laborPct: laborPct > 0 ? Math.round(laborPct * 100) / 100 : undefined,
      overUnder: form.overUnder !== '' ? f(form.overUnder) : undefined,
      food: f(form.food) || undefined,
      beer: f(form.beer) || undefined,
      liquor: f(form.liquor) || undefined,
      wine: f(form.wine) || undefined,
      na: f(form.na) || undefined,
    }
    setLog((l) => [...l.filter((x) => x.date !== form.date), n])
    setForm(EMPTY)
    setShowCats(false)
  }

  return (
    <>
      <PageHeader
        title="Nightly Numbers"
        subtitle={`Last 7 nights: ${money(weekTotal)} net · labor target ≤ ${targets.laborPct}%`}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Date">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={cls()} />
            </Field>
            <Field label="Gross sales">
              <MoneyInput value={form.gross} onChange={(v) => setForm({ ...form, gross: v })} />
            </Field>
            <Field label="Covers">
              <input type="number" inputMode="numeric" value={form.covers} onChange={(e) => setForm({ ...form, covers: e.target.value })} className={cls()} />
            </Field>
            <Field label="Rewards">
              <MoneyInput value={form.rewards} onChange={(v) => setForm({ ...form, rewards: v })} />
            </Field>
            <Field label="Promos">
              <MoneyInput value={form.promos} onChange={(v) => setForm({ ...form, promos: v })} />
            </Field>
            <Field label="Comps">
              <MoneyInput value={form.comps} onChange={(v) => setForm({ ...form, comps: v })} />
            </Field>
            <Field label="Staff discount">
              <MoneyInput value={form.staffDisc} onChange={(v) => setForm({ ...form, staffDisc: v })} />
            </Field>
            <Field label="Labor $">
              <MoneyInput value={form.labor} onChange={(v) => setForm({ ...form, labor: v })} />
            </Field>
            <Field label="Deposit">
              <MoneyInput value={form.deposit} onChange={(v) => setForm({ ...form, deposit: v })} />
            </Field>
            <Field label="Deposit over/under">
              <MoneyInput value={form.overUnder} onChange={(v) => setForm({ ...form, overUnder: v })} allowNegative />
            </Field>
          </div>

          {/* Live math strip */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2.5">
            <Pill label="Net" value={money2(net)} strong />
            {discounts > 0 && <Pill label="Discounts" value={`−${money2(discounts)}`} />}
            {laborPct > 0 && (
              <Pill
                label="Labor"
                value={`${laborPct.toFixed(1)}%`}
                tone={laborPct <= targets.laborPct ? 'up' : 'down'}
              />
            )}
            {form.overUnder !== '' && (
              <Pill label="Drawer" value={`${f(form.overUnder) >= 0 ? '+' : ''}${money2(f(form.overUnder))}`} tone={Math.abs(f(form.overUnder)) < 5 ? 'up' : 'down'} />
            )}
          </div>

          {/* Category breakdown (optional) */}
          <button onClick={() => setShowCats((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted">
            <ChevronDown size={13} className={`transition-transform ${showCats ? 'rotate-180' : ''}`} />
            Sales by category (optional)
          </button>
          {showCats && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(['food', 'beer', 'liquor', 'wine', 'na'] as const).map((c) => (
                <Field key={c} label={c === 'na' ? 'N/A bev' : c[0].toUpperCase() + c.slice(1)}>
                  <MoneyInput value={form[c]} onChange={(v) => setForm({ ...form, [c]: v })} />
                </Field>
              ))}
            </div>
          )}

          <input
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes — weather, events, callouts, 86'd items…"
            className={`mt-3 w-full ${cls()}`}
          />
          <button onClick={save} className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            Save night
          </button>
        </Card>

        <NightlyLog log={log} targets={targets} />

        {sorted.length > 0 && (
          <Card className="overflow-hidden">
            {sorted.map((n) => {
              const lp = n.laborPct ?? (n.labor && n.netSales ? (n.labor / n.netSales) * 100 : 0)
              return (
                <div key={n.id} className="border-b border-black/5 p-4 last:border-0">
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold text-ink">{fmtDate(n.date)}</span>
                    <span className="font-display text-lg font-semibold text-brand">{money(n.netSales)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                    {n.gross != null && <span>gross {money(n.gross)}</span>}
                    {lp > 0 && (
                      <span className={lp <= targets.laborPct ? 'text-up' : 'text-down'}>
                        labor {lp.toFixed(1)}%
                      </span>
                    )}
                    {n.overUnder != null && (
                      <span className={Math.abs(n.overUnder) < 5 ? '' : 'text-down'}>
                        drawer {n.overUnder >= 0 ? '+' : ''}{money2(n.overUnder)}
                      </span>
                    )}
                    {n.covers > 0 && <span>{n.covers} covers</span>}
                    {n.deposit > 0 && <span>deposit {money(n.deposit)}</span>}
                  </div>
                  {(n.food ?? 0) > 0 && <CatBar n={n} />}
                  {n.notes && <div className="mt-1 text-sm text-ink/70">{n.notes}</div>}
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </>
  )
}

// ---- Nightly Log — the single shift-notes home; composes the manager email ----

interface LogEntry {
  mod: string
  recap: string
  kitchen: string
  staffing: string
  maintenance: string
  comps: string
  wins: string
}
const EMPTY_LOG: LogEntry = { mod: '', recap: '', kitchen: '', staffing: '', maintenance: '', comps: '', wins: '' }
const LOG_FIELDS: Array<{ key: keyof LogEntry; label: string; ph: string }> = [
  { key: 'recap', label: 'Shift recap', ph: 'How did the night go?' },
  { key: 'kitchen', label: 'Kitchen', ph: '86’d items, ticket times, food notes…' },
  { key: 'staffing', label: 'Staffing', ph: 'Callouts, cuts, who crushed it…' },
  { key: 'maintenance', label: 'Maintenance', ph: 'Anything broken or fixed…' },
  { key: 'comps', label: 'Comps / voids', ph: 'What was comped and why…' },
  { key: 'wins', label: 'Wins', ph: 'Big tables, reviews, milestones…' },
]

function NightlyLog({ log, targets }: { log: Night[]; targets: Targets }) {
  const [entries, setEntries] = usePersistentState<Record<string, LogEntry>>('nightlog:entries', {})
  const [sent, setSent] = usePersistentState<Record<string, { lunch?: string; dinner?: string }>>('nightlog:sent', {})
  const [users] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const [date, setDate] = useState(today())
  const { concept, location } = useCurrentNames()

  const entry = entries[date] ?? EMPTY_LOG
  const setField = (k: keyof LogEntry, v: string) =>
    setEntries((e) => ({ ...e, [date]: { ...(e[date] ?? EMPTY_LOG), [k]: v } }))

  const todaySent = sent[today()] ?? {}

  const compose = async (meal: 'lunch' | 'dinner') => {
    const n = log.find((x) => x.date === date)
    const weekNet = log
      .filter((x) => x.date <= date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7)
      .reduce((s, x) => s + x.netSales, 0)
    const lp = n?.laborPct ?? (n?.labor && n.netSales ? (n.labor / n.netSales) * 100 : undefined)

    const lines: string[] = [
      `${concept} · ${location} — ${meal === 'lunch' ? 'Lunch' : 'Nightly'} recap, ${fmtDate(date)}`,
      entry.mod ? `MOD: ${entry.mod}` : '',
      '',
    ]
    if (n) {
      lines.push('— The numbers —')
      if (n.gross != null) lines.push(`Gross: ${money2(n.gross)}`)
      lines.push(`Net: ${money2(n.netSales)}`)
      lines.push(`Week net (7 nights): ${money2(weekNet)}`)
      if (n.labor != null) lines.push(`Labor: ${money2(n.labor)}${lp ? ` (${lp.toFixed(1)}% — target ≤ ${targets.laborPct}%)` : ''}`)
      if (n.deposit > 0) lines.push(`Deposit: ${money2(n.deposit)}`)
      if (n.overUnder != null) lines.push(`Drawer over/under: ${n.overUnder >= 0 ? '+' : ''}${money2(n.overUnder)}`)
      lines.push('')
    } else {
      lines.push('(No numbers saved for this date yet — see Nightly Numbers.)', '')
    }
    for (const f of LOG_FIELDS) {
      const v = entry[f.key].trim()
      if (v) lines.push(`— ${f.label} —`, v, '')
    }
    const body = lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
    const subject = `${location} ${meal === 'lunch' ? 'lunch' : 'nightly'} recap — ${fmtDate(date)}`

    try {
      await navigator.clipboard.writeText(body)
    } catch {
      /* clipboard unavailable — mailto still carries the body */
    }
    const stamp = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    setSent((s) => ({ ...s, [date]: { ...(s[date] ?? {}), [meal]: stamp } }))
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-ink">Nightly Log</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${todaySent.lunch ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'}`}>
          LUNCH {todaySent.lunch ? `✓ ${todaySent.lunch}` : '· due'}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${todaySent.dinner ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'}`}>
          DINNER {todaySent.dinner ? `✓ ${todaySent.dinner}` : '· due'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          />
          <select
            value={entry.mod}
            onChange={(e) => setField('mod', e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            <option value="">MOD…</option>
            {users.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {LOG_FIELDS.map((f2) => (
          <label key={f2.key} className="block">
            <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">{f2.label}</span>
            <textarea
              value={entry[f2.key]}
              onChange={(e) => setField(f2.key, e.target.value)}
              placeholder={f2.ph}
              rows={2}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => compose('lunch')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink"
        >
          {todaySent.lunch ? <Check size={14} className="text-up" /> : <Mail size={14} />} Lunch email
        </button>
        <button
          onClick={() => compose('dinner')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          {todaySent.dinner ? <Check size={14} /> : <Mail size={14} />} Dinner email
        </button>
        <span className="self-center text-xs text-muted">
          Builds the full recap with tonight's numbers, copies it, and opens your mail app.
        </span>
      </div>
    </Card>
  )
}

/** Thin category mix bar: food / beer / liquor / wine / N-A. */
function CatBar({ n }: { n: Night }) {
  const parts = [
    { v: n.food ?? 0, c: '#E4B84C', l: 'Food' },
    { v: n.beer ?? 0, c: '#F0A94C', l: 'Beer' },
    { v: n.liquor ?? 0, c: '#F472B6', l: 'Liquor' },
    { v: n.wine ?? 0, c: '#A78BFA', l: 'Wine' },
    { v: n.na ?? 0, c: '#60A5FA', l: 'N/A' },
  ].filter((p) => p.v > 0)
  const total = parts.reduce((s, p) => s + p.v, 0)
  if (total <= 0) return null
  return (
    <div className="mt-1.5 flex h-1.5 gap-px overflow-hidden rounded-full">
      {parts.map((p) => (
        <div key={p.l} title={`${p.l} $${p.v.toFixed(0)}`} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />
      ))}
    </div>
  )
}

function Pill({ label, value, tone, strong }: { label: string; value: string; tone?: 'up' | 'down'; strong?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-display font-semibold ${strong ? 'text-lg text-ink' : 'text-sm'} ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : strong ? '' : 'text-ink'}`}>
        {value}
      </span>
    </span>
  )
}

function MoneyInput({ value, onChange, allowNegative }: { value: string; onChange: (v: string) => void; allowNegative?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">$</span>
      <input
        type="number"
        inputMode="decimal"
        min={allowNegative ? undefined : 0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${cls()} pl-6`}
      />
    </div>
  )
}

function cls(): string {
  return 'rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
