// One printed order guide, for any shelf.
//
// There used to be a sheet for produce and a sheet for US Foods, each with its
// own columns, and nothing at all for liquor or beer — so printing the liquor
// guide printed the app screen, which is not a sheet you can carry into a
// stock room and write on. This is the sheet: a ruled grid with the store's
// own section bands, the pars that are set, and empty boxes to count into.
//
// The columns come from the guide rather than from a hard-coded list per
// shelf: a product number column only where the vendor prints one, a price
// column only where prices are known, two par columns only where the store
// orders twice a week. Add a shelf and it prints correctly on the first try.

import { Fragment } from 'react'
import { getCatalog, getPars } from '../lib/catalog'
import { getGuideSections, isVendorGuide, type GuideShelf } from '../lib/guide'

interface Row {
  code: string
  name: string
  size: string
  unit: string
  cost?: number
  m: number
  f?: number
}

const money = (n?: number) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '')
const num = (v?: number) => (typeof v === 'number' && v !== 0 ? String(v) : '')

/** Produce and the vendor sheets are ordered twice a week, to two levels. */
export const twoParShelf = (shelf: GuideShelf): boolean => shelf === 'Produce' || isVendorGuide(shelf)

export function GuideSheet({ shelf }: { shelf: GuideShelf }) {
  const pars = getPars()
  const byId = new Map(getCatalog().map((c) => [c.id, c]))
  const sections = getGuideSections(shelf)
    .map((sec) => ({
      title: sec.title,
      rows: sec.ids.flatMap<Row>((id) => {
        const ci = byId.get(id)
        if (!ci) return []
        const p = pars[id] ?? { par: 0, onHand: 0 }
        return [
          {
            code: ci.code ?? '',
            name: ci.name,
            size: ci.size ?? '',
            unit: ci.unit,
            cost: ci.cost,
            m: p.par,
            f: p.parF,
          },
        ]
      }),
    }))
    .filter((sec) => sec.rows.length > 0)

  const all = sections.flatMap((s) => s.rows)
  if (all.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Nothing on the {shelf} guide yet — add items on the Orders screen.
      </p>
    )
  }

  // What this shelf actually has to say. A column earns its width: the liquor
  // guide has a vendor number on the two dozen bottles that came off a receipt
  // and nothing on the other fifty-five, and a column that is nine-tenths
  // empty is width taken from the boxes somebody writes counts in.
  const hasCode = isVendorGuide(shelf) || all.filter((r) => r.code).length >= all.length * 0.6
  const hasSize = all.some((r) => r.size)
  const hasCost = all.some((r) => r.cost != null)
  const twoPar = twoParShelf(shelf)
  // One section is not a section — it's the whole sheet, and a band saying
  // "Items" above every row is noise.
  const bands = sections.length > 1
  // A short sheet fills the page: spare lines so a new item has somewhere to
  // go and the grid reaches the bottom of the paper. A long one just runs on.
  const spare = Math.max(0, 20 - all.length)
  // Long sheets get shorter rows so they don't run to twice the paper.
  const dense = all.length > 40
  const cols = 1 + (hasCode ? 1 : 0) + (hasSize ? 1 : 0) + (hasCost ? 1 : 0) + (twoPar ? 2 : 1)
  const tally = dense ? 6 : 14
  const title = `${shelf} Order Guide${isVendorGuide(shelf) ? ' · Sheet to Shelf' : ''}`

  const Cells = ({ r }: { r: Row }) => (
    <>
      {hasCode && (
        <td className="whitespace-nowrap border border-black/60 px-1.5 py-[3px] font-mono tabular-nums">{r.code}</td>
      )}
      <td className="border border-black/60 px-1.5 py-[3px] font-medium">{r.name}</td>
      {hasSize && <td className="border border-black/60 px-1.5 py-[3px]">{r.size}</td>}
      {hasCost && (
        <td className="whitespace-nowrap border border-black/60 px-1 py-[3px] text-right tabular-nums">
          {money(r.cost)}
          {r.cost != null && r.unit && r.unit !== 'cs' ? ` /${r.unit}` : ''}
        </td>
      )}
      <td className="border border-black/60 px-1 py-[3px] text-center tabular-nums">{num(r.m)}</td>
      {twoPar && (
        <td className="border border-black/60 px-1 py-[3px] text-center tabular-nums">{num(r.f ?? r.m)}</td>
      )}
      {Array.from({ length: tally }, (_, i) => (
        <td key={i} className="border border-black/40 px-0 py-[3px]" />
      ))}
    </>
  )

  return (
    <div className={`produce-guide${dense ? ' usf' : ''}`}>
      <div className="pg-band border-2 px-3 py-2 text-center">
        <span className="font-display text-xl font-bold tracking-wide text-ink">{title}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="pg-table w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {hasCode && <th className="pg-band pg-w-code border px-1.5 py-1 text-left font-bold uppercase">#</th>}
              <th className="pg-band pg-w-name border px-1.5 py-1 text-left font-bold uppercase">Product</th>
              {hasSize && (
                <th className="pg-band pg-w-size border px-1.5 py-1 text-left font-bold uppercase">
                  {isVendorGuide(shelf) ? 'Pack · brand' : 'Size'}
                </th>
              )}
              {hasCost && <th className="pg-band pg-w-price border px-1 py-1 text-right font-bold uppercase">$ / unit</th>}
              {/* Monday's par has to last to Friday's delivery and Friday's has
                  to cover the weekend — two numbers wherever a shelf is
                  ordered twice a week. */}
              <th className="pg-band pg-w-par border px-1 py-1 text-center font-bold uppercase">
                {twoPar ? 'M-Par' : 'Par'}
              </th>
              {twoPar && <th className="pg-band pg-w-par border px-1 py-1 text-center font-bold uppercase">F-Par</th>}
              {/* Undated on purpose — whoever counts writes the date in. */}
              {Array.from({ length: tally }, (_, i) => (
                <th key={i} className="border border-black/40 px-0 py-1" />
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.title}>
                {bands && (
                  <tr className="pg-section">
                    <td colSpan={cols + tally} className="border px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                      {sec.title}
                    </td>
                  </tr>
                )}
                {sec.rows.map((r) => (
                  <tr key={r.code || r.name}>
                    <Cells r={r} />
                  </tr>
                ))}
              </Fragment>
            ))}
            {Array.from({ length: spare }, (_, i) => (
              <tr key={`blank${i}`}>
                {Array.from({ length: cols + tally }, (_, c) => (
                  <td key={c} className={`border px-1 py-[3px] ${c < cols ? 'border-black/60' : 'border-black/40'}`}>
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
