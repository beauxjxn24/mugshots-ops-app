import { useMemo } from 'react'
import { PageHeader, Card } from '../components/ui'
import { usePersistentState } from '../lib/store'

interface CostInputs {
  sales: number
  food: number
  bev: number
  labor: number
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)

export function Costs() {
  const [v, setV] = usePersistentState<CostInputs>('costs:inputs', { sales: 0, food: 0, bev: 0, labor: 0 })
  const set = (k: keyof CostInputs, val: number) => setV((s) => ({ ...s, [k]: val }))

  const foodPct = useMemo(() => pct(v.food, v.sales), [v])
  const bevPct = useMemo(() => pct(v.bev, v.sales), [v])
  const laborPct = useMemo(() => pct(v.labor, v.sales), [v])
  const prime = foodPct + bevPct + laborPct

  return (
    <>
      <PageHeader title="Costs" subtitle="Food, beverage & labor cost % for a period" />
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
        <Card className="p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Net sales" value={v.sales} onChange={(n) => set('sales', n)} />
            <Field label="Food purchases" value={v.food} onChange={(n) => set('food', n)} />
            <Field label="Beverage purchases" value={v.bev} onChange={(n) => set('bev', n)} />
            <Field label="Labor $" value={v.labor} onChange={(n) => set('labor', n)} />
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Food cost" value={foodPct} goal={30} />
          <Metric label="Bev cost" value={bevPct} goal={22} />
          <Metric label="Labor" value={laborPct} goal={30} />
          <Metric label="Prime cost" value={prime} goal={60} big />
        </div>

        <Card className="p-4 text-sm text-muted text-pretty">
          <b className="text-ink">Prime cost</b> (food + bev + labor as a share of sales) is the number
          most operators watch — under ~60% is healthy for a bar & grill. Enter a period’s totals
          above (from Nightly Numbers + Invoices) to see where you stand. Live Toast numbers will
          auto-fill this once the backend is connected.
        </Card>
      </div>
    </>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded-lg border border-black/10 bg-white py-2 pl-7 pr-3 text-sm outline-none focus:border-brand"
        />
      </div>
    </label>
  )
}

function Metric({ label, value, goal, big }: { label: string; value: number; goal: number; big?: boolean }) {
  const over = value > goal
  return (
    <Card className="p-4">
      <div className={`font-display font-semibold ${big ? 'text-3xl' : 'text-2xl'} ${over ? 'text-down' : 'text-up'}`}>
        {value.toFixed(1)}%
      </div>
      <div className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-xs text-muted">goal ≤ {goal}%</div>
    </Card>
  )
}
