import { useNavigate } from 'react-router-dom'
import { useRole, type Role } from '../lib/role'

/** Admin ↔ Manager ↔ Staff view switch (a stand-in for real per-account roles).
 *  Admin is the owner — the only role that can switch stores and see other
 *  stores' numbers. Manager runs one store; Staff gets the My-Shift view. */
export function RoleToggle() {
  const role = useRole((s) => s.role)
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()

  const pick = (r: Role) => {
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
