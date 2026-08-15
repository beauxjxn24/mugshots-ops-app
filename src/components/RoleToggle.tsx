import { useNavigate } from 'react-router-dom'
import { useRole, type Role } from '../lib/role'
import { pinMatches } from '../lib/users'
import { forgetUnlock } from '../lib/daycode'

/** Admin ↔ Manager ↔ Staff view switch (a stand-in for real per-account roles).
 *  Admin is the owner — the only role that can switch stores and see other
 *  stores' numbers. Manager runs one store; Staff gets the My-Shift view. */
export function RoleToggle() {
  const role = useRole((s) => s.role)
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()

  // Stepping UP needs a PIN. Without this the day code is decoration: a cook
  // who is in as staff could tap 'admin' and read every store's numbers.
  // Dropping to staff is free -- that is a manager handing the tablet over.
  const pick = (r: Role) => {
    if (r !== 'staff' && role === 'staff') {
      const pin = window.prompt('Manager PIN to leave the staff view:')
      if (!pin || !pinMatches(pin.trim())) {
        if (pin) window.alert('That PIN is not on the manager list.')
        return
      }
    }
    if (r === 'staff') forgetUnlock()
    setRole(r)
    navigate(r === 'staff' ? '/shift' : '/')
  }

  return (
    <div className="mb-3 rounded-xl bg-white/10 p-1">
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
    </div>
  )
}
