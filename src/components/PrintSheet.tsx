// The printed prep sheet — the paper artifact, designed as one.
//
// What it fixes: the old printout was one full-width column of rows, so any
// real list ran onto a second page and read like a receipt. This sheet splits
// the list into TWO ruled columns on the page and steps its type down as the
// list grows, so a day's prep is always ONE page a cook can clip to the shelf.
//
// The split is computed HERE, in code, into two explicit flex columns — not
// with CSS `columns`. CSS multi-column is exactly what was tried before and it
// printed as garbage on iOS/Safari (one half-width column balanced across
// dozens of near-blank pages). Two plain divs side by side cannot do that on
// any engine.
//
// Both the kitchen and the bar print through this component, so the two sheets
// stay the same sheet — one place to tune, and the bar can never fall behind
// the kitchen's layout again.
//
// All visual rules live in index.css under `@media print` (the pp-* classes):
// this thing only exists on paper, so its styles live with the print styles.

export interface PrintRow {
  name: string
  /** Small grey line under the name — the spec card / storage note. */
  sub?: string
  /** Preformatted quantity, e.g. "3 pans" — the caller owns par vs need math. */
  qty: string
}

export interface PrintSection {
  name: string
  rows: PrintRow[]
}

interface Unit {
  key: string
  head?: string
  cont?: boolean
  row?: PrintRow
  sec: string
}

export function PrintSheet({
  title,
  accent,
  date,
  venue,
  counted,
  sections,
}: {
  title: string
  /** Station colour — a chip by the title and the header rule, nothing else.
      Section bars stay black: pale station colours under white text don't
      survive a grayscale laser printer. */
  accent?: string
  date: string
  venue: string
  /** Whether on-hands were entered — decides what the footer says the numbers mean. */
  counted: boolean
  sections: PrintSection[]
}) {
  // Flatten to a run of units so the column split can cut anywhere.
  const units: Unit[] = sections.flatMap((s) => [
    { key: `h:${s.name}`, head: s.name, sec: s.name },
    ...s.rows.map((r, i) => ({ key: `r:${s.name}:${r.name}:${i}`, row: r, sec: s.name })),
  ])

  // A header is shorter than a row; weight it so the columns balance by height,
  // not by count.
  const weight = (u: Unit) => (u.head ? 0.7 : 1)
  const total = units.reduce((a, u) => a + weight(u), 0)

  // Short lists stay one column — two half-empty columns is its own kind of
  // unprofessional. Everything real splits.
  let col1 = units
  let col2: Unit[] = []
  if (units.length > 14) {
    let acc = 0
    let cut = units.length
    for (let i = 0; i < units.length; i++) {
      acc += weight(units[i])
      if (acc >= total / 2) {
        cut = i + 1
        break
      }
    }
    // Never strand a section header as the last line of the left column.
    while (cut > 0 && units[cut - 1].head) cut--
    col1 = units.slice(0, cut)
    col2 = units.slice(cut)
    // If the right column starts mid-section, repeat the header so the column
    // says where it is instead of opening with orphan rows.
    if (col2.length > 0 && col2[0].row) {
      col2 = [{ key: `cont:${col2[0].sec}`, head: col2[0].sec, cont: true, sec: col2[0].sec }, ...col2]
    }
  }

  // The one-page guarantee: as the list grows past what the base type fits,
  // the sheet tightens instead of spilling to page two.
  const perCol = Math.max(col1.length, col2.length)
  const density = perCol > 33 ? 'pp-dense' : perCol > 28 ? 'pp-compact' : ''

  const printedAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  return (
    // Divs, not <header>/<footer>: the print CSS hides every `header` element
    // to kill the app bars, and a semantic header here would vanish with them.
    <div className={`pp ${density}`}>
      <div className="pp-head" style={accent ? { borderColor: accent } : undefined}>
        <div>
          <div className="pp-kicker">Daily prep · {venue}</div>
          <div className="pp-title">
            {accent && <span className="pp-chip" style={{ background: accent }} aria-hidden />}
            {title}
          </div>
        </div>
        <div className="pp-head-r">
          <div className="pp-date">{date}</div>
          <div className="pp-printed">Printed {printedAt}</div>
        </div>
      </div>

      <div className="pp-cols">
        {[col1, col2]
          .filter((c) => c.length > 0)
          .map((col, ci) => (
            <div className="pp-col" key={ci}>
              {col.map((u) =>
                u.head ? (
                  <div className="pp-sec" key={u.key}>
                    {u.head}
                    {u.cont ? ' · cont.' : ''}
                  </div>
                ) : (
                  <div className="pp-row" key={u.key}>
                    <span className="pp-box" aria-hidden />
                    <span className="pp-item">
                      <span className="pp-name">{u.row!.name}</span>
                      {u.row!.sub && <span className="pp-spec">{u.row!.sub}</span>}
                    </span>
                    <span className="pp-qty">{u.row!.qty}</span>
                  </div>
                ),
              )}
            </div>
          ))}
      </div>

      <div className="pp-foot">
        <span>
          {counted
            ? 'Qty = prep needed · on-hands already counted in the app'
            : "Qty = today's par · no on-hands counted yet"}{' '}
          · check the box as each item is finished · items at par don't print
        </span>
        <span>The Pass · Daily Ops</span>
      </div>
    </div>
  )
}
