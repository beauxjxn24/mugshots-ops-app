import { useMemo, useState } from 'react'
import { Zap, Sparkles } from 'lucide-react'
import { useMugsyOn, getAiKey } from '../lib/mugsy'
import { Page, Card } from '../components/ui'
import { SearchInput } from '../components/SearchInput'
import { PROVIDERS, CATEGORIES } from '../lib/providers'
import { getConnections, setConnection, connectReadiness, STATUS_LABEL } from '../lib/connections'
import { toast } from '../lib/toast'
import { EventSources } from '../components/EventSources'

export function Connections() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('All')
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const conn = useMemo(() => getConnections(), [tick])
  const { ready, why } = connectReadiness()

  /**
   * Start the permission handshake.
   *
   * Marks the connection pending and hands off to the server, which is what
   * actually sends you to the provider and keeps the token that comes back.
   * Until that server exists the button above is disabled, so this only ever
   * runs against a real backend.
   */
  const grant = (id: string) => {
    setConnection(id, { status: 'pending' })
    setTick((t) => t + 1)
    toast('Opening the provider to grant access…', 'success')
  }

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
      <Page
        title="Connections"
        subtitle="Connect your POS, distributors, and marketplaces — or read anything via drop-box"
        right={
          <SearchInput value={q} onChange={setQ} placeholder="Search integrations…" className="w-full max-w-xs" />
        }
      >
        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          <b>Your stack:</b> {mine.map((p) => p.label).join(' · ')}. Don’t see a vendor? Any
          distributor works through the <b>drop-box reader</b> — drop their invoice or order guide
          and the app reads it. New live integrations get added here as providers open their APIs.
        </Card>

        <MugsySwitch />

        {/* Not a vendor integration, but the same kind of thing: something this
            store has told the app to go and read on a schedule. It sits above
            the catalog because it's configured per store rather than shopped
            for. */}
        <EventSources />

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
                  {/* What THIS store has actually granted, not what the catalog
                      ships as. A provider being capable of a live sync and
                      being connected to are different facts and used to read
                      as one. */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      conn[p.id]?.status === 'on'
                        ? 'bg-up/15 text-up'
                        : conn[p.id]?.status === 'broken'
                          ? 'bg-down/15 text-down'
                          : conn[p.id]?.status === 'pending'
                            ? 'bg-warn/15 text-warn'
                            : 'bg-black/5 text-muted'
                    }`}
                  >
                    {STATUS_LABEL[conn[p.id]?.status ?? 'off']}
                  </span>
                  <span className="text-[10px] font-semibold text-muted/70">
                    {p.mode === 'api' && p.apiAvailable
                      ? 'live API'
                      : p.mode === 'api'
                        ? 'API unconfirmed'
                        : 'drop-box'}
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

              {/* Granting permission is the whole mechanism, so the button
                  says what it's waiting on rather than opening a window that
                  goes nowhere. The token lands on the server, never here —
                  see lib/connections.ts. */}
              <button
                disabled={!ready}
                onClick={() => ready && grant(p.id)}
                className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-semibold ${
                  ready ? 'bg-navy text-white' : 'bg-navy text-white/90 opacity-70'
                }`}
                title={ready ? undefined : why}
              >
                {conn[p.id]?.status === 'on'
                  ? 'Connected'
                  : p.apiAvailable
                    ? 'Grant access'
                    : 'Use drop-box'}
              </button>
              {!ready && (
                <p className="mt-1.5 text-[11px] leading-tight text-muted">{why}</p>
              )}
              {p.mode === 'api' && !p.apiAvailable && (
                <p className="mt-1.5 text-[11px] leading-tight text-warn">
                  Ask {p.label} whether they offer an API to their customers — that answer decides
                  whether this is a connection or a file drop.
                </p>
              )}
            </Card>
          ))}
        </div>
            </Page>
  )
}

/**
 * Mugsy's on/off switch.
 *
 * On this page because it's the same kind of decision as the rest of it — what
 * this place is wired up to — and because it's the one integration whose key
 * you buy rather than are granted.
 *
 * Asleep by default. Without a key Mugsy can't answer anything; all it does is
 * tell whoever tapped it to go and paste one, and it does that from a button
 * floating over every screen in the building. Off is the honest state until
 * there's a key behind it.
 */
function MugsySwitch() {
  const [on, setOn] = useMugsyOn()
  const hasKey = Boolean(getAiKey())
  return (
    <Card className={`p-4 ${on ? 'border-brand/20 bg-brand/5' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Sparkles size={16} className={`shrink-0 ${on ? 'text-brand-600' : 'text-muted'}`} />
        <span className="font-display text-base font-semibold text-ink">Mugsy</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            !on ? 'bg-black/5 text-muted' : hasKey ? 'bg-up/15 text-up' : 'bg-warn/15 text-warn'
          }`}
        >
          {!on ? 'ASLEEP' : hasKey ? 'ON' : 'ON — NO KEY YET'}
        </span>
        <button
          onClick={() => setOn(!on)}
          role="switch"
          aria-checked={on}
          aria-label={on ? 'Put Mugsy to sleep' : 'Wake Mugsy up'}
          className={`ml-auto h-7 w-12 shrink-0 rounded-full border transition-colors ${
            on ? 'border-brand bg-brand' : 'border-black/15 bg-black/10'
          }`}
        >
          {/* bg-ink, not bg-white: the dark theme remaps .bg-white to the
              surface colour, which made the knob the same shade as the track
              it slides on — a switch with no visible switch. */}
          <span
            className={`block size-5 rounded-full bg-ink transition-transform ${
              on ? 'translate-x-[22px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">
        {on
          ? 'The Ask Mugsy button is on every manager screen. It reads this store’s data — sales, labor, mix, order guide, invoices, tips, bookings, notes — and asks Claude about it. Advice only: it can’t change anything, place an order, or send anything.'
          : 'Switched off, and the Ask Mugsy button isn’t on screen at all. Nothing is lost — flip this back on whenever you want it.'}
      </p>
      {/* The part that isn't obvious from a toggle: it's the one thing in here
          that costs money per use, and it's billed to you, not to the app. */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        Needs a Claude API key from <b>console.anthropic.com</b>, pasted into the ⚙ on the Mugsy
        panel. Billed to your own Anthropic account, roughly a few cents a question, and each
        device needs its own — nothing here syncs. Every question sends a snapshot of this store’s
        data to Anthropic.
      </p>
    </Card>
  )
}
