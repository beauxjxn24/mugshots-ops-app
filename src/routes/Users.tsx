import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { requirePin } from '../lib/pin'
import { DEFAULT_USERS, USER_ROLES, newUserId, type User } from '../lib/users'

/**
 * Admin → Users & privileges. Managers only (name, role, PIN) — the schedule
 * pulls its rows from here, and GM/Area Director/Admin PINs unlock gated
 * actions. Hourly staff live on the Staff screen; the two rosters are separate
 * by design (owner-confirmed).
 */
export function Users() {
  const [rawUsers, setUsers] = usePersistentState<User[]>('users:list', DEFAULT_USERS)
  const users = Array.isArray(rawUsers) ? rawUsers : DEFAULT_USERS
  const [form, setForm] = useState({ name: '', role: 'Manager' as User['role'], pin: '' })

  const add = async () => {
    if (!form.name.trim()) return
    if (!(await requirePin('Add a user'))) return
    setUsers((u) => [...u, { id: newUserId(), name: form.name.trim(), role: form.role, pin: form.pin }])
    setForm({ name: '', role: 'Manager', pin: '' })
  }

  const update = async (id: string, patch: Partial<User>) => {
    if (!(await requirePin('Edit users'))) return
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  return (
    <>
      <PageHeader
        title="Users & privileges"
        subtitle={`${users.length} manager${users.length === 1 ? '' : 's'} · PINs unlock schedule, publish & store setup`}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          <div className="flex gap-2.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />
            <span>
              This is the <b>manager</b> roster — it drives the Mgr Schedule and PIN unlocks.
              Hourly team members (tips, shifts) live on the <b>Staff</b> screen. The two lists
              are separate on purpose.
            </span>
          </div>
        </Card>

        {/* Add */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="Full name"
              className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {USER_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              placeholder="PIN"
              inputMode="numeric"
              className="w-20 rounded-lg border border-black/10 bg-white px-3 py-2 text-center font-mono text-sm outline-none focus:border-brand"
            />
            <button onClick={add} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              Add
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            A PIN is 4 digits. Only GM, Area Director, and Admin PINs unlock gated actions.
          </p>
        </Card>

        <Card className="divide-y divide-black/5">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white">
                {initials(u.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{u.name}</div>
                <div className="text-xs text-muted">{u.role}</div>
              </div>
              <select
                value={u.role}
                onChange={(e) => update(u.id, { role: e.target.value as User['role'] })}
                className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand"
              >
                {USER_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <KeyRound size={13} />
                <input
                  defaultValue={u.pin}
                  onBlur={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
                    if (v !== u.pin) update(u.id, { pin: v })
                  }}
                  placeholder="—"
                  inputMode="numeric"
                  className="w-14 rounded-md border border-black/10 bg-white px-1.5 py-1 text-center font-mono outline-none focus:border-brand"
                />
              </span>
              <button
                onClick={async () => {
                  if (users.length <= 1) return
                  if (await confirmDelete(`Remove ${u.name} from Users?`, 'Their PIN stops unlocking; schedule row goes away.', 'Remove'))
                    setUsers((list) => list.filter((x) => x.id !== u.id))
                }}
                aria-label={`Remove ${u.name}`}
                className="text-muted hover:text-down"
              >
                ✕
              </button>
            </div>
          ))}
        </Card>
      </div>
    </>
  )
}

function initials(n: string): string {
  const s = n ?? ''
  const parts = s.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || s.slice(0, 2).toUpperCase()
}
