import { useMemo } from 'react'
import { PageHeader } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'

export function LTO() {
  // Limited-time offers: the Summer LTO group plus any build flagged as an LTO.
  const lto = useMemo(
    () => SPECS.filter((s) => s.g === 'Summer LTO' || /LTO/i.test(s.shelf) || /LTO/i.test(s.yields)),
    [],
  )
  return (
    <>
      <PageHeader title="LTO" subtitle={`${lto.length} limited-time offers & specials`} />
      <div className="p-4 sm:p-6 lg:p-8">
        <SpecGrid specs={lto} />
      </div>
    </>
  )
}
