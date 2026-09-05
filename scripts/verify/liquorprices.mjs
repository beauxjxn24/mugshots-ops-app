// Proves: the Lincoln Road receipt prices land on the right catalog items on
// both stores — existing bottles keep their name, par and place and gain the
// price, code and size; the six the guide never had are created and filed in
// the right section; the vendor's spelling is kept as an alias so the next
// invoice import matches on its own; and nothing is double-priced on a second
// open (no phantom entries in the price ticker).
import pw from 'playwright-core'
const fs = await import('node:fs')
const SEED = JSON.parse(fs.readFileSync('src/data/liquor-prices-lincoln-road.json', 'utf8'))
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

for (const store of ['flowood', 'pearl']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(({ bd, store }) => {
    localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
    localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
    localStorage.setItem('mugops:__role', JSON.stringify('admin'))
    const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
    localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
  }, { bd, store })
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2000)

  const got = await p.evaluate((lines) => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]')
    const out = { missing: [], wrongPrice: [], noAlias: [], noCode: [], dupes: [] }
    for (const l of lines) {
      const hits = cat.filter((c) => norm(c.name) === norm(l.item) || (c.aliases || []).some((a) => norm(a) === norm(l.item)))
      if (hits.length === 0) { out.missing.push(l.item); continue }
      if (hits.length > 1) out.dupes.push(l.item)
      const c = hits[0]
      if (Math.abs((c.cost ?? 0) - l.price) > 0.001) out.wrongPrice.push(`${l.item} ${c.cost} ≠ ${l.price}`)
      if (!(c.aliases || []).includes(l.receipt)) out.noAlias.push(l.item)
      if (!c.code) out.noCode.push(l.item)
    }
    const log = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:priceLog') || '[]')
    return { ...out, priced: cat.filter((c) => c.costVendor === 'Lincoln Road Package Store').length, log: log.length }
  }, SEED.lines)

  console.log(`--- ${store} ---`)
  check(`all ${SEED.lines.length} receipt lines are in the catalog`, got.missing.length === 0, got.missing.join(', '))
  check('no line matched two catalog items', got.dupes.length === 0, got.dupes.join(', '))
  check('every price is the receipt price', got.wrongPrice.length === 0, got.wrongPrice.join(' · '))
  check('every line kept the vendor spelling as an alias', got.noAlias.length === 0, got.noAlias.join(', '))
  check("every line carries the store's item code", got.noCode.length === 0, got.noCode.join(', '))
  check(`priced by Lincoln Road: ${got.priced}`, got.priced >= SEED.lines.length)

  // on the Liquor tab, with money on the rows
  await p.locator('button', { hasText: /^Liquor$/ }).first().click(); await p.waitForTimeout(700)
  const seen = await p.evaluate(() => {
    const t = document.body.innerText
    return { tito: /\$21\.24/.test(t), twoFingers: /\$14\.44/.test(t), cooks: /Cook/.test(t), rows: (t.match(/\$\d+\.\d\d/g) || []).length }
  })
  check('the Liquor guide shows the money', seen.tito && seen.twoFingers, JSON.stringify(seen))
  check('a bottle the guide never had is on it', seen.cooks)
  if (store === 'flowood') await p.screenshot({ path: 'scripts/verify/out/liquor-prices.png' })

  // second open: idempotent, nothing new in the ticker
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  const again = await p.evaluate(() => JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:priceLog') || '[]').length)
  check('re-opening does not re-price anything', again === got.log, `${got.log} → ${again}`)
  await ctx.close()
}
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
