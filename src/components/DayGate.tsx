import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UtensilsCrossed } from 'lucide-react'
import { useRole } from '../lib/role'
import { dayCode, rememberUnlock, unlockedToday } from '../lib/daycode'
import { getUsers } from '../lib/users'

/**
 * The front door.
 *
 * An employee opens the app, types today's staff code, and lands on their
 * shift. A manager types their own PIN instead and gets the manager or admin
 * experience — same box, two kinds of key, so nobody has to find a "log in as"
 * menu before they can start.
 *
 * Unlocking is remembered for the rest of the day, so a tablet on the line is
 * not asking for a code every time it sleeps.
 */
export function DayGate({ children }: { children: React.ReactNode }) {
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => !unlockedToday())
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  if (!open) return <>{children}</>

  const submit = () => {
    const v = code.trim()
    if (v.length < 4) return

    // A manager's PIN takes precedence: they may well know the staff code too,
    // and being dropped into the staff view would be the wrong answer.
    const user = getUsers().find((u) => u.pin && u.pin === v)
    if (user) {
      const role = user.role === 'Admin' || user.role === 'Area Director' ? 'admin' : 'manager'
      setRole(role)
      rememberUnlock()
      setOpen(false)
      navigate('/')
      return
    }

    if (v === dayCode()) {
      setRole('staff')
      rememberUnlock()
      setOpen(false)
      navigate('/shift')
      return
    }

    setErr("That code doesn't work today — check with your manager.")
    setCode('')
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-navy px-5">
      <div className="w-full max-w-xs text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-brand text-white">
          <UtensilsCrossed size={26} />
        </span>
        <h1 className="font-display text-2xl font-semibold text-white">The Pass</h1>
        <p className="mt-1 text-sm text-white/50">Enter today's code to start your shift.</p>

        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
            if (err) setErr('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="numeric"
          autoFocus
          aria-label="Today's code"
          placeholder="••••"
          className="mt-6 w-full rounded-2xl border-2 border-white/15 bg-white/5 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] text-white outline-none placeholder:text-white/25 focus:border-brand"
        />
        {err && <p className="mt-2 text-sm font-semibold text-down">{err}</p>}

        <button
          onClick={submit}
          disabled={code.length < 4}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Start shift
        </button>
        <p className="mt-4 text-xs text-white/35">Managers: enter your PIN instead.</p>
      </div>
    </div>
  )
}
