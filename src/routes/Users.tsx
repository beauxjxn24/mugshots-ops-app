import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { Page, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'
import { confirmDelete } from '../lib/confirm'
import { requirePin } from '../lib/pin'
import { DEFAULT_USERS, PERMS, USER_ROLES, newUserId, permsOf, type Perm, type User } from '../lib/users'
import { dayCode } from '../lib/daycode'

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

  // There is no Save button on this screen — every control commits on its own.
  // That's fine for a dropdown or a chip, where the change is its own feedback,
  // but a PIN box you typed into and clicked away from gives you nothing back,
  // so a row says so for a couple of seconds.
  const [saved, setSaved] = useState<string | null>(null)
  const flash = (id: string) => {
    setSaved(id)
    setTimeout(() => setSaved((s) => (s === id ? null : s)), 1800)
  }

  const update = async (id: string, patch: Partial<User>) => {
    if (!(await requirePin('Edit users'))) return
    setUsers((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    flash(id)
  }

  // Handing a right out or taking it back. Deliberately gated on the master key
  // rather than on any narrower grant: someone who can edit permissions can
  // grant themselves everything, so this is the one door that stays with the
  // people who already hold all of them.
  const togglePerm = async (u: User, perm: Perm) => {
    const held = permsOf(u)
    const next = held.includes(perm) ? held.filter((p) => p !== perm) : [...held, perm]
    await update(u.id, { perms: next })
  }

  return (
      <Page
        title="Users & privileges"
        subtitle={`${users.length} manager${users.length === 1 ? '' : 's'} · PINs unlock schedule, publish & store setup`}
        width="narrow"
      >
        {/* Today's staff code. Managers read it off here and give it to the
            floor; it rolls over on its own at 4am, with the business day. */}
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 border-brand/30 bg-navy p-4 text-white">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand">
            <KeyRound size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-white/45">
              Today's staff code
            </span>
            <span className="block text-xs text-white/55">
              Give this to the floor — it rolls over at 4am, not midnight, so a closer finishing at
              half past twelve isn't locked out on a code nobody has handed out yet. Every device
              at this store shows the same four digits.
            </span>
          </span>
          <span className="ml-auto font-mono text-3xl font-bold tracking-[0.2em] text-signal">
            {dayCode()}
          </span>
        </Card>

        <Card className="border-brand/20 bg-brand/5 p-4 text-sm text-ink/80">
          <div className="flex gap-2.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" />
            <span>
              This is the <b>manager</b> roster — it drives the Mgr Schedule and PIN unlocks.
              Hourly team members (tips, shifts) live on the <b>Staff</b> screen. The two lists
              are separate on purpose.
              <br />
              Tap the chips under a name to hand a right out or take it back. The role sets the
              starting point — Admin, Area Director and GM get <b>Unlock all</b>, everyone else
              starts with nothing until you give it to them.
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
            A PIN is 4 digits. What it clears is set by the rights on their row — a new AGM or
            Manager clears nothing until you tick something on.
            <br />
            There's no Save button below: a name or PIN saves when you press Enter or tap away,
            and the role and rights save the moment you change them. The row says <b>Saved</b> when
            it lands.
          </p>
        </Card>

        <Card className="divide-y divide-black/5">
          {users.map((u) => {
            const held = permsOf(u)
            const master = held.includes('unlock')
            return (
              <div key={u.id} className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white">
                    {initials(u.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* A name couldn't be corrected once added — a typo meant
                        removing the person and re-adding them, which takes
                        their PIN and rights with it. */}
                    <input
                      key={`${u.id}-${u.name}`}
                      defaultValue={u.name}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v && v !== u.name) update(u.id, { name: v })
                        else e.target.value = u.name
                      }}
                      aria-label={`Name for ${u.name}`}
                      className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 font-medium text-ink outline-none hover:border-black/10 focus:border-brand"
                    />
                    <div className="flex items-center gap-2 px-1 text-xs text-muted">
                      {u.role}
                      {saved === u.id && <span className="font-bold text-up">Saved</span>}
                    </div>
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
                      key={`${u.id}-${u.pin}`}
                      defaultValue={u.pin}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
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

                {/* What their PIN clears. Tap to hand a right out or take it
                    back. Holding the master key already covers the rest, so
                    those show as covered rather than as separate switches to
                    keep in sync. */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                  {PERMS.map(({ key, label, hint }) => {
                    const on = held.includes(key)
                    const covered = master && key !== 'unlock'
                    return (
                      <button
                        key={key}
                        onClick={() => togglePerm(u, key)}
                        title={covered ? `${hint} — already covered by Unlock all` : hint}
                        aria-pressed={on || covered}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          on
                            ? 'border-brand bg-brand text-white'
                            : covered
                              ? 'border-brand/25 bg-brand/5 text-brand-600'
                              : 'border-black/10 bg-white text-muted hover:border-brand/40 hover:text-brand-600'
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                  {held.length === 0 && (
                    <span className="text-[11px] text-muted">No rights — their PIN clears nothing.</span>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
            </Page>
  )
}

function initials(n: string): string {
  const s = n ?? ''
  const parts = s.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || s.slice(0, 2).toUpperCase()
}
