import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Delete, Search, UtensilsCrossed } from 'lucide-react'
import { useRole } from '../lib/role'
import { dayCode, rememberUnlock, unlockedToday, setShiftPerson } from '../lib/daycode'
import { getUsers } from '../lib/users'
import { getStaff } from '../lib/staff'

/** Reads the way someone would greet you walking in. */
function greeting(): string {
  const h = new Date().getHours()
  if (h < 11) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The front door.
 *
 * Two taps: today's code, then who you are. A manager's PIN goes in the same
 * box and skips straight through — one door, two kinds of key, no "log in as"
 * menu to find first.
 *
 * The keypad is deliberate. This gets opened on a tablet in a kitchen, often
 * with one hand and rarely with dry ones; a keyboard popping over a small text
 * field is the wrong instrument. Big targets, no keyboard, no typing.
 *
 * Naming yourself at sign-in is what lets the prep sheet and the sidework stamp
 * who did the work without stopping to ask for initials on every tick. Until
 * there are real accounts, this is the app's only idea of who you are — an
 * honest convenience, not an identity check.
 */
export function DayGate({ children }: { children: React.ReactNode }) {
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => !unlockedToday())
  const [step, setStep] = useState<'code' | 'who'>('code')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const roster = useMemo(
    () => getStaff().map((p) => p.name).sort((a, b) => a.localeCompare(b)),
    [step],
  )
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? roster.filter((n) => n.toLowerCase().includes(needle)) : roster
  }, [roster, q])

  // Four digits is the whole input — check as soon as it's there rather than
  // making someone reach for a button.
  useEffect(() => {
    if (step !== 'code' || code.length < 4) return
    const user = getUsers().find((u) => u.pin && u.pin === code)
    if (user) {
      setRole(user.role === 'Admin' || user.role === 'Area Director' ? 'admin' : 'manager')
      setShiftPerson(user.name)
      rememberUnlock()
      setOpen(false)
      navigate('/')
      return
    }
    if (code === dayCode()) {
      setStep('who')
      return
    }
    setErr("That code isn't right for today")
    setCode('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step])

  if (!open) return <>{children}</>

  const press = (d: string) => {
    if (err) setErr('')
    setCode((c) => (c.length >= 4 ? c : c + d))
  }

  const start = (name: string) => {
    setRole('staff')
    setShiftPerson(name)
    rememberUnlock()
    setOpen(false)
    navigate('/shift')
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-navy">
      {/* Depth without a photograph — two soft brand-coloured pools that keep
          the screen from reading as a plain form. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 size-[28rem] rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-brand), transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 size-[24rem] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--color-signal), transparent 70%)' }}
      />

      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
        {step === 'code' ? (
          <div className="w-full max-w-[22rem] text-center">
            <span className="mx-auto mb-5 grid size-16 place-items-center rounded-[1.25rem] bg-brand text-white shadow-lg shadow-brand/25">
              <UtensilsCrossed size={30} />
            </span>
            <h1 className="font-display text-[28px] font-semibold leading-tight text-white">
              {greeting()}
            </h1>
            <p className="mt-1.5 text-sm text-white/50">Enter today's code to clock into the app.</p>

            {/* Four dots, so progress is visible without reading anything. */}
            <div className="mt-8 flex justify-center gap-3.5" aria-label={`${code.length} of 4 digits`}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-3.5 rounded-full transition-all duration-200 ${
                    err
                      ? 'bg-down/70'
                      : i < code.length
                        ? 'scale-110 bg-signal'
                        : 'bg-white/15'
                  }`}
                />
              ))}
            </div>
            <p className={`mt-3 h-5 text-sm font-semibold ${err ? 'text-down' : 'text-transparent'}`}>
              {err || '—'}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => press(d)}
                  className="rounded-2xl bg-white/[0.07] py-4 font-mono text-2xl font-semibold text-white transition-colors active:bg-white/20"
                >
                  {d}
                </button>
              ))}
              <span />
              <button
                onClick={() => press('0')}
                className="rounded-2xl bg-white/[0.07] py-4 font-mono text-2xl font-semibold text-white transition-colors active:bg-white/20"
              >
                0
              </button>
              <button
                onClick={() => {
                  if (err) setErr('')
                  setCode((c) => c.slice(0, -1))
                }}
                aria-label="Delete"
                className="grid place-items-center rounded-2xl text-white/45 transition-colors active:bg-white/10"
              >
                <Delete size={22} />
              </button>
            </div>

            <p className="mt-6 text-xs text-white/30">Managers: enter your PIN.</p>
          </div>
        ) : (
          <div className="flex w-full max-w-md flex-col" style={{ maxHeight: 'min(85dvh, 40rem)' }}>
            <h1 className="text-center font-display text-[26px] font-semibold text-white">
              Who's on shift?
            </h1>
            <p className="mt-1.5 text-center text-sm text-white/50">
              Tap your name — it goes on the work you check off today.
            </p>

            {roster.length > 8 && (
              <div className="relative mt-5">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Find your name…"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-brand"
                />
              </div>
            )}

            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-1">
              {shown.map((n) => (
                <button
                  key={n}
                  onClick={() => start(n)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3.5 py-3 text-left transition-colors active:bg-brand/30"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/25 text-[11px] font-extrabold uppercase text-white">
                    {n
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join('')}
                  </span>
                  <span className="truncate text-[15px] font-semibold text-white">{n}</span>
                </button>
              ))}
              {roster.length === 0 && (
                <p className="rounded-xl bg-white/[0.06] px-4 py-6 text-center text-sm text-white/50">
                  No one on the roster yet — a manager can drop the Toast employee export on the
                  Imports screen.
                </p>
              )}
              {roster.length > 0 && shown.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-white/45">No one matches "{q}".</p>
              )}
            </div>

            <button
              onClick={() => {
                setStep('code')
                setCode('')
                setQ('')
              }}
              className="mt-3 shrink-0 py-2 text-xs font-semibold text-white/40"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
