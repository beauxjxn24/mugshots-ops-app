// Multiplying a recipe.
//
// A prep card is written for one batch. Making three means doing the maths in
// your head, at a bench, in the middle of a shift — which is exactly when a
// third of a cup times three becomes a guess.
//
// ── The rule this file follows ────────────────────────────────────────────────
//
// Scale the LEADING quantity and nothing else, and say so when a line couldn't
// be scaled. Every amount on the real cards starts with its quantity ("2 cups",
// "1/3 cup", "1 pack (5.7 oz)"), so the leading number is the batch size and
// anything after it is a unit or a note. What's in brackets is usually the size
// of the thing you're buying — a 5.7 oz pack is 5.7 oz however many you open —
// so it stays put.
//
// The screen always shows the original next to the scaled figure. A cook can
// check the arithmetic against the card without leaving the card, and the
// thirteen lines that read "as needed" or "pinch" are called out as unscaled
// rather than quietly passed off as done. A wrong number in a recipe is worse
// than no multiplier at all.

/** Exact thirds and sixths matter here, so quantities stay rational. */
interface Frac {
  n: number
  d: number
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const norm = ({ n, d }: Frac): Frac => {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1
  return { n: n / g, d: d / g }
}

/**
 * Read the number at the front of an amount.
 *
 * Handles "2", "1/2", "1 1/3", "2-1/2" and "5.7". The hyphen form is a mixed
 * number on these cards, not a range — "2-1/2 C" is two and a half cups. A real
 * range uses an en dash ("8–10 per bottle") and is handled separately.
 */
const LEAD = /^(\d+)\s*[-‑]\s*(\d+)\/(\d+)|^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d*\.\d+)|^(\d+)/

function readLead(s: string): { f: Frac; len: number } | null {
  const m = LEAD.exec(s)
  if (!m) return null
  const len = m[0].length
  if (m[1]) return { f: norm({ n: +m[1] * +m[3] + +m[2], d: +m[3] }), len } // 2-1/2
  if (m[4]) return { f: norm({ n: +m[4] * +m[6] + +m[5], d: +m[6] }), len } // 1 1/3
  if (m[7]) return { f: norm({ n: +m[7], d: +m[8] }), len } //               1/3
  if (m[9]) {
    // 5.7 — keep it decimal-friendly by using a power-of-ten denominator.
    const dp = m[9].split('.')[1].length
    return { f: norm({ n: Math.round(+m[9] * 10 ** dp), d: 10 ** dp }), len }
  }
  return { f: { n: +m[10], d: 1 }, len }
}

/** Render a quantity the way a prep sheet writes one: 2, 1/2, 1 1/3, 5.7. */
function show({ n, d }: Frac): string {
  if (d === 1) return String(n)
  // Tenths and hundredths read better as decimals than as 57/10.
  if (d === 10 || d === 100 || d === 1000) return String(+(n / d).toFixed(3))
  const whole = Math.floor(n / d)
  const rem = n - whole * d
  if (!whole) return `${rem}/${d}`
  return `${whole} ${rem}/${d}`
}

export interface Scaled {
  /** What to put on screen. Equals `from` when nothing could be scaled. */
  text: string
  /** The card's own wording, always kept so the cook can check it. */
  from: string
  /** True when the maths was done; false means "read the original". */
  ok: boolean
  /** Scaled, but something in it was deliberately left alone — say which. */
  note?: string
}

/**
 * Lines that must NOT be multiplied, and why.
 *
 * A RATE — "8–10 per bottle" — is already per-something. Doubling the batch
 * gives you two bottles, still 8–10 in each; turning it into "16–20 per bottle"
 * would have someone putting twice the jalapeños in one bottle of tequila.
 *
 * A PORTION SIZE — "7 oz portions" — is how big each one is, not how many.
 * Doubling the batch doesn't make them fourteen ounces. Note the unit in the
 * middle: "10 portions" with no unit IS a count and does scale.
 */
// "per bottle", and also "portions / bag" — the spaced slash is the same idea
// written shorter. A slash with no spaces is a fraction ("1/6 Pan"), so the
// spacing is what tells them apart.
const RATE = /\bper\b|\s\/\s*[A-Za-z]/i
const PORTION_SIZE = /^\s*[\d./\s-]+\s*(oz|lb|lbs|g|kg|ml|l|qt|quart|cup|c)\b[^(]*\bportions?\b/i

/**
 * Multiply one amount.
 *
 * Ranges scale at both ends. A leading "~" is kept, because an approximate
 * three pounds doubled is an approximate six.
 */
export function scaleAmount(raw: string, by: number): Scaled {
  const from = raw
  if (by === 1) return { text: raw, from, ok: true }
  const s = raw.trim()
  if (!s) return { text: raw, from, ok: true }

  const approx = s.startsWith('~') ? '~' : ''
  const body = approx ? s.slice(1).trimStart() : s

  // A rate outside brackets, or a portion size: leave the whole line alone.
  // ("24 tsp (2 tsp per portion)" is fine — the rate is in the brackets, and
  // brackets are never touched, so the 24 still scales.)
  const outside = body.replace(/\([^)]*\)/g, '')
  if (RATE.test(outside)) return { text: raw, from, ok: false, note: 'a rate — already per unit' }
  if (PORTION_SIZE.test(outside))
    return { text: raw, from, ok: false, note: 'a portion size, not a count' }

  // A range: scale both ends, keep whatever follows.
  //
  // The spacing is the whole tell, and the cards are consistent about it. A
  // TIGHT dash is a range — "6–7 portions", "8–10 per bottle". A SPACED dash is
  // a separator naming one container's size — "1 – 1/6 Pan" is one sixth-pan,
  // "1 – 8 qt cambro" is one eight-quart cambro. Read as ranges those came out
  // as "3–3/6 Pan" and "3–24 qt cambro", which is a different vessel, not three
  // of the same one. Spaced falls through, so only the count scales.
  const range = /^(\d+(?:\.\d+)?)[–—](\d+(?:\.\d+)?)(?!\s*\/)(.*)$/.exec(body)
  if (range) {
    const lo = readLead(range[1])!.f
    const hi = readLead(range[2])!.f
    return {
      text: `${approx}${show(norm({ n: lo.n * by, d: lo.d }))}–${show(norm({ n: hi.n * by, d: hi.d }))}${range[3]}`,
      from,
      ok: true,
    }
  }

  const lead = readLead(body)
  // "as needed", "pinch", "juice of 2" — no leading quantity, so there is
  // nothing this can honestly multiply. Say so rather than guess.
  if (!lead) return { text: raw, from, ok: false }

  const rest = body.slice(lead.len)
  const scaled = norm({ n: lead.f.n * by, d: lead.f.d })
  // Anything in brackets stays as written — a 5.7 oz pack is 5.7 oz however
  // many you open. But when the bracket carries its own number it gets called
  // out, because "(7 patties)" alongside a doubled weight is the one place this
  // could quietly mislead someone.
  const bracket = /\(([^)]*\d[^)]*)\)/.exec(rest)
  return {
    text: `${approx}${show(scaled)}${plural(rest, scaled)}`,
    from,
    ok: true,
    note: bracket ? `“${bracket[1]}” left as written` : undefined,
  }
}

/**
 * "1 cup" → "2 cups", but "2 oz" stays "2 oz".
 *
 * Only the words a prep sheet actually spells out get an s. Abbreviations never
 * do — nobody writes "2 ozs" — and neither do words already plural.
 */
const PLURALS = new Set([
  'cup', 'pan', 'bag', 'block', 'bucket', 'can', 'case', 'pack', 'packet', 'quart',
  'gallon', 'loaf', 'lime', 'liter', 'bottle', 'jug', 'portion', 'batch', 'breast',
  'patty', 'sheet', 'tray', 'container', 'squeeze', 'clove', 'sleeve', 'box',
])
function plural(rest: string, q: Frac): string {
  if (q.n / q.d <= 1) return rest
  // The s goes on the last word of the noun phrase, not the first: a gallon jug
  // times three is three gallon JUGS, not three gallons jug.
  const m = /^(\s+)([A-Za-z]+)(?:\s+([A-Za-z]+))?/.exec(rest)
  if (!m) return rest
  const tail = m[3] && PLURALS.has(m[3].toLowerCase()) ? m[3] : null
  const w = tail ?? m[2]
  const base = w.toLowerCase()
  if (!PLURALS.has(base)) return rest
  const s =
    base === 'loaf'
      ? 'loaves'
      : base === 'patty'
        ? 'patties'
        : // batch → batches, box → boxes. Appending a bare s gives "batchs".
          /(ch|sh|s|x|z)$/.test(base)
          ? `${w}es`
          : `${w}s`
  return rest.replace(m[0], m[0].replace(new RegExp(`${w}$`), s))
}

/** The batch sizes worth one tap. Anything else is typed. */
export const BATCHES = [1, 2, 3, 4] as const
