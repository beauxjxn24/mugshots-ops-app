import { PageHeader, Card } from '../components/ui'
import { NAV_FLAT } from '../lib/nav'
import { useLocation } from 'react-router-dom'

export function Placeholder() {
  const loc = useLocation()
  const item = NAV_FLAT.find((i) => i.to === loc.pathname)
  return (
    <>
      <PageHeader title={item?.label ?? 'Section'} subtitle="Being rebuilt in the new app" />
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
            {item?.icon ? <item.icon size={26} /> : null}
          </div>
          <h2 className="font-display text-xl font-semibold text-ink">{item?.label}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted text-pretty">
            This screen is part of the ground-up rebuild. The foundation, design system, your
            migrated recipe data, and the Dashboard, Specs, Imports and Connections screens are
            live — this section is next in the queue.
          </p>
        </Card>
      </div>
    </>
  )
}
