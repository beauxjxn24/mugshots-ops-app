import { useMemo } from 'react'
import { PageHeader } from '../components/ui'
import { SpecGrid } from '../components/SpecGrid'
import { SPECS } from '../lib/specs'
import { isDrink } from '../lib/categories'

export function Drinks() {
  const drinks = useMemo(() => SPECS.filter(isDrink), [])
  return (
    <>
      <PageHeader title="Signature Drinks" subtitle={`${drinks.length} bar builds & recipes`} />
      <div className="p-4 sm:p-6 lg:p-8">
        <SpecGrid specs={drinks} />
      </div>
    </>
  )
}
