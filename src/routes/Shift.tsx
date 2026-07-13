import { Link } from 'react-router-dom'
import { Card } from '../components/ui'
import { useCurrentNames } from '../lib/scope'
import { Sparkles, ListChecks, ChefHat, Banknote, BookOpen, ChevronRight } from 'lucide-react'

const TILES = [
  { to: '/sidework', label: 'Sidework', desc: 'Your opening & closing duties', icon: Sparkles, color: '#2DD4BF' },
  { to: '/checklists', label: 'Checklists', desc: 'Open / close / weekly', icon: ListChecks, color: '#34D399' },
  { to: '/prep', label: 'Prep List', desc: 'What to prep today', icon: ChefHat, color: '#FB7185' },
  { to: '/tipshare', label: 'Tipshare', desc: 'Tonight’s tip split', icon: Banknote, color: '#4ADE80' },
  { to: '/specs', label: 'Recipes', desc: 'Builds & prep cards', icon: BookOpen, color: '#E4B84C' },
]

export function Shift() {
  const { location } = useCurrentNames()
  const hour = new Date().getHours()
  const greet = hour < 11 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-5 mt-2">
        <div className="font-display text-2xl font-semibold text-ink">{greet} 👋</div>
        <div className="text-sm text-muted">
          {location} ·{' '}
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

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
  )
}
