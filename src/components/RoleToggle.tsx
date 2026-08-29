import { useNavigate } from 'react-router-dom'
import { useRole, type Role } from '../lib/role'
import { forgetUnlock } from '../lib/daycode'
import { requirePin } from '../lib/pin'

/** Admin ↔ Manager ↔ Staff view switch (a stand-in for real per-account roles).
 *  Admin is the owner — the only role that can switch stores and see other
 *  stores' numbers. Manager runs one store; Staff gets the My-Shift view. */
export function RoleToggle() {
  const role = useRole((s) => s.role)
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()

  // Stepping UP needs a PIN. Without this the day code is decoration: a cook
  // who is in as staff could tap 'admin' and read every store's numbers.
  //
  // Stepping DOWN is free and, importantly, does NOT sign you out. It used to
  // call forgetUnlock(), on the reasoning that dropping to staff meant handing
  // the tablet over — so tapping "Staff" wiped the unlock, the presence stamp
  // and your name, and threw you straight back to the passcode screen.
  // Instantly, every time, on every device. That is what "it keeps timing out"
  // actually was; the clock had nothing to do with it.
  //
  // This control says "Viewing as". It's a manager looking at the staff screen,
  // which is a preview, not a handover. Handing the device over is a real thing
  // people do, so it kept its own button below — said out loud instead of
  // hiding inside a view switch.
  // Through the app's own PIN gate, not window.prompt. The browser prompt has
  // no way to mask what's typed, so the manager PIN was going in as plain text
  // in front of whoever was stood at the till, and it summoned a full keyboard
  // rather than digits. requirePin also honours the 20-minute unlock, so
  // stepping in and out of the staff view stops asking every single time.
  const pick = async (r: Role) => {
    if (r !== 'staff' && role === 'staff' && !(await requirePin('Leave the staff view'))) return
    setRole(r)
    navigate(r === 'staff' ? '/shift' : '/')
  }

  /** Actually give the device to someone else: lock it and ask who they are. */
  const handOff = () => {
    if (!window.confirm('Lock this device and ask for the day code?')) return
    forgetUnlock()
    setRole('staff')
    navigate('/shift')
    location.reload()
  }

  // Margin lives on the rail's stack, not on each block — four components each
  // owning their own gap is how they ended up unevenly spaced.
  return (
    <div className="rail-block p-1 hover:!bg-white/[0.06]">
      <div className="mb-1 px-1.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
        Viewing as
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['admin', 'manager', 'staff'] as const).map((r) => (
          <button
            key={r}
            onClick={() => pick(r)}
            className={`rounded-lg px-1.5 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
              role === r ? 'bg-brand text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <button
        onClick={handOff}
        className="mt-1 w-full rounded-lg px-1.5 py-1.5 text-[10px] font-semibold text-white/40 hover:bg-white/10 hover:text-white/70"
      >
        Hand the device over
      </button>
    </div>
  )
}
