// Cleans OCR'd invoice / order-guide lines before they become catalog items.
// Photos read through tesseract carry noise ("»| 22217 / wooDFoRD RESERVE /
// BOURBON / 750ml ]") — the owner wants just the item's NAME ("Woodford
// Reserve Bourbon"): junk chars out, vendor code split off, pack sizes and
// garbled fragments dropped, shouting tidied.

/** Pack-size / count tokens that belong in the unit column, not the name. */
const SIZE_TOKEN =
  /^\d+(?:\.\d+)?\s?(?:ml|m|l|ltr|liter|oz|lb|lbs|ct|cs|ea|pk|gal|g|kg|qt|pt|btl|bt|can|dz)s?[.)]?$|^\d+\/\d+(?:ml|l|lb|oz|ct)?$|^\d+x\d+(?:ml|oz|l)?$/i

/** Digit-letter mongrels that aren't sizes — OCR debris like "t8%mil", "e036". */
const WEIRD = (w: string) => /\d/.test(w) && /[a-z]/i.test(w) && !SIZE_TOKEN.test(w)

export interface CleanedLine {
  name: string
  code?: string
  /** Pack size pulled out of the name (750ml, 4/5LB, 24 ct…). */
  size?: string
  /** True when the line is too garbled to become an item. */
  junk: boolean
}

export function cleanItemLine(raw: string): CleanedLine {
  const flat = raw
    // OCR noise characters that are never part of a product name
    .replace(/[|»«¢©®™°§\[\]{}<>~_=+*"“”‘’()]/g, ' ')
    // order guides separate fields with slashes (but keep 6/5LB-style packs)
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  let code: string | undefined
  let size: string | undefined
  const kept: string[] = []
  let dropped = 0
  const tokens = flat.split(' ').filter(Boolean)
  for (const w of tokens) {
    const bare = w.replace(/^[^A-Za-z0-9$']+|[^A-Za-z0-9%.')]+$/g, '')
    if (!bare) continue
    // First standalone 4–7 digit number near the front = the vendor code.
    if (!code && kept.length <= 2 && /^\d{4,7}$/.test(bare)) {
      code = bare
      continue
    }
    // Sizes/packs live in their own column, not the name.
    if (SIZE_TOKEN.test(bare)) {
      size ??= bare
      continue
    }
    // Stray numbers and single letters are debris.
    if (/^\d{1,3}$/.test(bare) || /^[A-Za-z]$/.test(bare)) {
      dropped++
      continue
    }
    // Digit-letter mongrels are OCR garble — drop the token, keep the line.
    if (WEIRD(bare)) {
      dropped++
      continue
    }
    kept.push(bare)
  }

  const name = kept.join(' ')
  const letters = (name.match(/[A-Za-z]/g) || []).length
  // The whole line is junk when almost nothing readable survived.
  const junk = letters < 4 || kept.length === 0 || dropped > kept.length + 1
  return { name: tidyName(name), code, size, junk }
}

/** Mostly-uppercase OCR names read better in Title Case. */
export function tidyName(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, '').length
  if (!letters) return s
  const upper = (s.match(/[A-Z]/g) || []).length
  if (upper / letters < 0.6) return s
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (SIZE_TOKEN.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}
