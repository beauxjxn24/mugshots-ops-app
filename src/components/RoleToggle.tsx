import { useNavigate } from 'react-router-dom'
import { useRole } from '../lib/role'

/** Manager ↔ Staff view switch (a stand-in for real per-account roles). */
export function RoleToggle() {
  const role = useRole((s) => s.role)
  const setRole = useRole((s) => s.setRole)
  const navigate = useNavigate()

  const pick = (r: 'manager' | 'staff') => {
    setRole(r)
    navigate(r === 'staff' ? '/shift' : '/')
  }

  return (
    <div className="mb-3 rounded-xl bg-white/10 p-1">
      <div className="mb-1 px-1.5 text-[9px] font-bold uppercase tracking-wider text-white/40">
        Viewing as
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(['manager', 'staff'] as const).map((r) => (
          <button
            key={r}
            onClick={() => pick(r)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition-colors ${
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
