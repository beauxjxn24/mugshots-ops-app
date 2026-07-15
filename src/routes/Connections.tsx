import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { PROVIDERS, CATEGORIES } from '../lib/providers'

export function Connections() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('All')

  const list = useMemo(() => {
    const query = q.trim().toLowerCase()
    return PROVIDERS.filter(
      (p) =>
        (cat === 'All' || p.category === cat) &&
        (!query || p.label.toLowerCase().includes(query)),
    ).sort((a, b) => Number(b.inUse) - Number(a.inUse) || (a.label ?? '').localeCompare(b.label ?? ''))
  }, [q, cat])

  const mine = PROVIDERS.filter((p) => p.inUse)

  return (
    <>
      <PageHeader
        title="Connections"
        subtitle="Connect your POS, distributors, and marketplaces — or read anything via drop-box"
        right={
          <SearchInput value={q} onChange={setQ} placeholder="Search integrations…" className="w-full max-w-xs" />
        }
      />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          <b>Your stack:</b> {mine.map((p) => p.label).join(' · ')}. Don’t see a vendor? Any
          distributor works through the <b>drop-box reader</b> — drop their invoice or order guide
          and the app reads it. New live integrations get added here as providers open their APIs.
        </Card>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          {['All', ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                cat === c
                  ? 'border-brand bg-brand text-white'
                  : 'border-black/10 bg-white text-muted hover:border-brand/40'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id} className={`p-5 ${p.inUse ? 'ring-2 ring-brand/30' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-base font-semibold text-ink">{p.label}</div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {p.category}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.inUse && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                      YOUR STACK
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      p.mode === 'api' ? 'bg-up/10 text-up' : 'bg-black/5 text-muted'
                    }`}
                  >
                    {p.mode === 'api' ? 'Live API' : 'Drop-box'}
                  </span>
                </div>
              </div>

              <ul className="mt-3 space-y-1">
                {p.automation.slice(0, 3).map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-ink/70">
                    <Zap size={13} className="mt-0.5 shrink-0 text-brand" />
                    {a}
                  </li>
                ))}
              </ul>

              <button
                disabled
                className="mt-4 w-full rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white/90 opacity-70"
                title="Live connect ships with the backend phase; drop-box works today on the Imports screen"
              >
                {p.apiAvailable ? 'Connect' : 'Use drop-box'}
              </button>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
