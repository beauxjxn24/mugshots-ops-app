import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { useCurrentNames } from '../lib/scope'
import { useShift, shiftLabel } from '../lib/shift'
import { usePersistentState, today } from '../lib/store'
import { prepSendKey, type PrepSend } from '../lib/prepsend'
import { prepDoneKey, type PrepCheck } from '../lib/prepdone'
import { Sparkles, ChefHat, Banknote, BookOpen, ChevronRight, Check } from 'lucide-react'

// No Checklists tile: open/close/weekly is the manager's walk of the building.
// An hourly's opening and closing duties are their sidework, the tile above.
const TILES = [
  { to: '/sidework', label: 'Sidework', desc: 'Your opening & closing duties', icon: Sparkles, color: '#2DD4BF' },
  { to: '/prep', label: 'Prep List', desc: 'What to prep today', icon: ChefHat, color: '#FB7185' },
  { to: '/tipshare', label: 'Tipshare', desc: 'Tonight’s tip split', icon: Banknote, color: '#4ADE80' },
  { to: '/specs', label: 'Recipes', desc: 'Builds & prep cards', icon: BookOpen, color: '#E4B84C' },
]

export function Shift() {
  const { location } = useCurrentNames()
  const { shift } = useShift()
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  // The prep list landing is the one thing on this screen worth interrupting
  // for — otherwise a cook has to keep opening Prep to find out whether it's
  // out yet.
  const t = today()
  const [sent] = usePersistentState<PrepSend | null>(prepSendKey(t), null)
  const [done] = usePersistentState<Record<string, PrepCheck>>(prepDoneKey(t), {})
  const left = sent ? sent.items.filter((i) => !done[i.name]).length : 0

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-3xl">
      <div className="mb-5 mt-2">
        <div className="font-display text-2xl font-semibold text-ink">{greet} 👋</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {/* Which shift they're on, said once and up front — every other screen
              is already set to it, and this is where they find that out. */}
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-600">
            {shiftLabel(shift)} shift
          </span>
          <span>
            {location} ·{' '}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>

      {sent && (
        <Link
          to="/prep"
          className={`mb-4 flex items-center gap-3 rounded-2xl px-4 py-3.5 ${
            left === 0 ? 'bg-up/12' : 'bg-brand/12'
          }`}
        >
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${left === 0 ? 'bg-up/20 text-up' : 'bg-brand/20 text-brand-600'}`}>
            {left === 0 ? <Check size={20} /> : <ChefHat size={20} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block font-display text-base font-semibold ${left === 0 ? 'text-up' : 'text-ink'}`}>
              {left === 0 ? 'Prep list complete' : 'Prep list is ready'}
            </span>
            <span className="block text-xs text-muted">
              {left === 0
                ? `All ${sent.items.length} done`
                : `${left} left of ${sent.items.length} · sent ${new Date(sent.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted" />
        </Link>
      )}

      <div className="space-y-3">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to}>
            <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{ background: `${t.color}22`, color: t.color }}
              >
                <t.icon size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-semibold text-ink">{t.label}</div>
                <div className="text-sm text-muted">{t.desc}</div>
              </div>
              <ChevronRight size={20} className="text-muted" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </div>
  )
}
