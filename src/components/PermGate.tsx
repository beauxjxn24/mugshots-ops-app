import { useEffect, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Card } from './ui'
import { requirePin, usePin } from '../lib/pin'
import { holdsPerm, PERMS, type Perm } from '../lib/users'

/**
 * A whole screen behind a permission, not just the buttons on it.
 *
 * The manager schedule was readable by anyone who could reach the page — only
 * editing and publishing asked for a PIN. Who is on next Saturday, and what
 * everyone is scheduled for, is a manager's business, and the app runs on
 * shared devices where "reaching the page" means tapping a nav item.
 *
 * Asks once on arrival and rides the same twenty-minute unlock as every other
 * gated action, so a manager already working doesn't get a second prompt. Left
 * locked rather than bounced to the dashboard: being sent somewhere else with
 * no explanation reads as a broken link, and the reason belongs on screen.
 */
export function PermGate({
  perm,
  what,
  children,
}: {
  perm: Perm
  /** What's behind the gate, named for the prompt: "the manager schedule". */
  what: string
  children: ReactNode
}) {
  const until = usePin((s) => s.unlockedUntil)
  const held = usePin((s) => s.unlockedPerms)
  const open = Date.now() < until && holdsPerm(held, perm)
  const [asked, setAsked] = useState(false)

  // Ask on arrival. The ref-free guard is `asked`: without it a declined prompt
  // would reopen the moment the render settles, and there'd be no way off the
  // page but the back button.
  useEffect(() => {
    if (open || asked) return
    setAsked(true)
    void requirePin(`Open ${what}`, perm)
  }, [open, asked, what, perm])

  if (open) return <>{children}</>

  const label = PERMS.find((p) => p.key === perm)?.label ?? perm
  return (
    <div className="mx-auto max-w-md p-6 sm:p-10">
      <Card className="p-6 text-center">
        <span className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-brand/10 text-brand">
          <Lock size={20} />
        </span>
        <div className="font-display text-lg font-semibold text-ink">Manager only</div>
        <p className="mt-1 text-sm text-muted">
          {what[0].toUpperCase() + what.slice(1)} needs a PIN with <b className="text-ink">{label}</b> rights.
        </p>
        <button
          onClick={() => void requirePin(`Open ${what}`, perm)}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white"
        >
          Enter PIN
        </button>
      </Card>
    </div>
  )
}
