import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'

export function LTO() {
  // Limited-time offers: the Summer LTO group plus any build flagged as an LTO.
  const lto = useMemo(
    () => SPECS.filter((s) => s.g === 'Summer LTO' || /LTO/i.test(s.shelf) || /LTO/i.test(s.yields)),
    [],
  )
  // Deep link (?item=Name) — e.g. the dashboard's Food Focus card — opens
  // that build directly instead of dumping you at the top of the page.
  const [params] = useSearchParams()
  const want = (params.get('item') ?? '').toLowerCase()
  const initialOpen = want ? lto.find((s) => s.name.toLowerCase() === want)?.name : undefined
  return (
    <>
      <PageHeader title="LTO" subtitle={`${lto.length} limited-time offers & specials`} />
      <div className="p-4 sm:p-6 lg:p-8">
        <SpecGrid specs={lto} initialOpen={initialOpen} />
      </div>
    </>
  )
}
