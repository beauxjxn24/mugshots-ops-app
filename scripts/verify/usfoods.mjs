// Proves: each store's US Foods guide seeds from ITS OWN sheet in sheet-to-shelf
// order with product numbers; the copy-out carries the numbers; US Foods items
// do not also land on "Food & other"; adding an item on the tab lands it in the
// section it was added to (with its product number and the vendor set — it
// used to vanish); an item moves by tap, a step up and to the end of another
// section; the Printables sheet prints multi-page, landscape, in black ink with
// the storage bands, at the page's full width so nothing wraps mid-number; and
// a Flowood device that seeded Pearl's list before Flowood had its own sheet
// migrates: Pearl-only lines come off Flowood's guide, the layout becomes
// Flowood's, pars and hand-added items survive, Pearl's guide is untouched.
import pw from 'playwright-core'
const { chromium } = pw
const SP = 'scripts/verify/out'
const fs = await import('node:fs')
fs.mkdirSync(SP, { recursive: true })
const pages = (f) => (fs.readFileSync(f).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length
const bd = (() => { const d = new Date(); if (d.getHours() < 4) d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
let failed = 0
const check = (label, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`) }

// The sheets the app ships, so the expectations come from the data, not from
// a copy of it typed in here.
const SHEETS = {
  pearl: JSON.parse(fs.readFileSync('src/data/usfoods-guide-pearl.json', 'utf8')),
  flowood: JSON.parse(fs.readFileSync('src/data/usfoods-guide-flowood.json', 'utf8')),
}
const walk = (rows) => [...new Set(rows.map((r) => r.group))]
// A section to add into and the one to move to, per store.
const ADD_IN = { pearl: 'Bar', flowood: 'Liquor Closet' }
const MAX_PAGES = { pearl: 8, flowood: 10 }

const unlock = async (p, store) => {
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(({ bd, store }) => {
    localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
    localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
    localStorage.setItem('mugops:__role', JSON.stringify('admin'))
    const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
    localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
  }, { bd, store })
}
const setStore = (p, store) => p.evaluate((store) => {
  const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
  localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
}, store)
// Always a full reload: a hash-router goto to the route already open is not a
// navigation, and localStorage written by the test (pars, scope) is only read
// at boot.
const openUsFoods = async (p) => {
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' })
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(700)
}
// What the tab shows: section bands in order, the header count, which codes are on it.
const guide = (p, codes) => p.evaluate((codes) => {
  const t = document.body.innerText
  const bands = [...document.querySelectorAll('span.tracking-wider.text-brand-600')].map((s) => s.firstChild.textContent.trim())
  return { bands, items: (t.match(/\d+ items/) || [])[0], has: Object.fromEntries(codes.map((c) => [c, t.includes(`#${c}`)])) }
}, codes)
const whereIs = (p, code) => p.evaluate((code) => {
  const chip = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === `#${code}`)
  if (!chip) return null
  const row = chip.closest('.group')
  const section = row.parentElement.parentElement
  const band = section.querySelector('span').firstChild.textContent.trim()
  const rows = [...section.querySelectorAll('.group')]
  return { band, idx: rows.indexOf(row), count: rows.length }
}, code)
const newContext = async () => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    window.__copied = ''
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true })
    window.__prints = 0; window.print = () => { window.__prints++ }
  })
  return { ctx, p }
}

for (const store of ['pearl', 'flowood']) {
  const rows = SHEETS[store]
  const first = rows[0].code, last = rows[rows.length - 1].code
  const { ctx, p } = await newContext()
  await unlock(p, store)
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800)

  const tabs = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /^(Liquor|Beer|Produce|US Foods|Food & other)$/.test(t)))
  console.log(`--- ${store} --- tabs: ${tabs.join(' | ')}`)
  check('US Foods tab present', tabs.includes('US Foods'))
  check('no "Food & other" (USF items not double-listed)', !tabs.includes('Food & other'))

  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(700)
  const g = await guide(p, [first, last])
  check(`sections in the ${store} sheet's walk order`, g.bands.join(' → ') === walk(rows).join(' → '), g.bands.join(' → '))
  check('header count', g.items === `${rows.length} items`, g.items)
  check('first and last product # shown', g.has[first] && g.has[last], `#${first} ${g.has[first]} · #${last} ${g.has[last]}`)
  check('brand on pack line', await p.evaluate(() => document.body.innerText.includes('MONOGRAM')))

  // give one item a par so the copy-out has a line, then copy
  await p.evaluate(() => {
    const sc = JSON.parse(localStorage.getItem('mugops:__scope'))
    const key = `mugops:mugshots|${sc.currentLocation}::catalog:pars`
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]')
    const cup = cat.find((c) => c.code === '728865')
    const pars = JSON.parse(localStorage.getItem(key) || '{}')
    pars[cup.id] = { par: 3, onHand: 1 }
    localStorage.setItem(key, JSON.stringify(pars))
  })
  await openUsFoods(p)
  await p.locator('button', { hasText: /^Copy order/ }).first().click(); await p.waitForTimeout(400)
  const copied = await p.evaluate(() => window.__copied)
  check('copy-out carries product #', /2 cs · #728865 — Cup, Foam 12 Oz White/.test(copied), JSON.stringify(copied.split('\n').slice(0, 2).join(' / ')))
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-orders.png` })

  // ---- add an item to a section, product number first ---------------------
  const sec = ADD_IN[store]
  await p.locator(`button[title="Add an item to ${sec}"]`).click(); await p.waitForTimeout(200)
  await p.locator('input[placeholder="product #"]').fill('9990001')
  await p.locator(`input[placeholder="New ${sec} item — Enter to add"]`).fill('Test Widget, Case Of Twelve')
  await p.keyboard.press('Enter'); await p.waitForTimeout(500)
  const added = await whereIs(p, '9990001')
  check(`added item lands at the end of ${sec} with its product #`, !!added && added.band === sec && added.idx === added.count - 1, JSON.stringify(added))
  const cat = await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]').find((x) => x.code === '9990001')
    return c ? { vendor: c.vendor, category: c.category, unit: c.unit } : null
  })
  check('catalog item is US Foods', cat?.vendor === 'US Foods', JSON.stringify(cat))

  // ---- move it by tap: one up, then to the end of Office ------------------
  await p.locator('.group', { hasText: '#9990001' }).locator('button[title="Click to edit this item"]').click(); await p.waitForTimeout(300)
  await p.locator('button[title="Move up"]').click(); await p.waitForTimeout(400)
  const up = await whereIs(p, '9990001')
  check(`Move up steps it one row up inside ${sec}`, !!up && up.band === sec && up.idx === added.idx - 1, JSON.stringify(up))
  await p.locator('select[aria-label="Move to section"]').selectOption({ label: 'Office' }); await p.waitForTimeout(400)
  const moved = await whereIs(p, '9990001')
  check('Move to section puts it at the end of Office', !!moved && moved.band === 'Office' && moved.idx === moved.count - 1, JSON.stringify(moved))
  check('the edit panel followed the item', await p.locator('button[title="Move up"]').count() === 1)
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-move.png`, fullPage: false })
  // the product # is editable on this guide
  const codeField = p.locator('label', { hasText: 'Product #' }).locator('input')
  check('edit panel offers the product #', (await codeField.inputValue()) === '9990001')
  await codeField.fill('9990002'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
  check('product # edit saved', !!(await whereIs(p, '9990002')))
  // reload: the layout and the vendor persist
  await openUsFoods(p)
  const after = await whereIs(p, '9990002')
  check('survives reload in Office', !!after && after.band === 'Office', JSON.stringify(after))

  // ---- Printables ---------------------------------------------------------
  await p.goto('http://localhost:4180/#/printables', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
  await p.locator('button', { hasText: /^US Foods order guide/ }).first().click(); await p.waitForTimeout(500)
  // landscape letter at the sheet's 10mm margins ≈ 979px across
  await p.setViewportSize({ width: 979, height: 700 })
  await p.emulateMedia({ media: 'print' }); await p.waitForTimeout(300)
  const pr = await p.evaluate(() => {
    const el = document.querySelector('.produce-guide.usf')
    const table = el.querySelector('table')
    const cell = el.querySelector('tbody tr:not(.pg-section) td')
    const band = el.querySelector('.pg-section td')
    const overflowing = [...el.querySelectorAll('tbody tr:not(.pg-section)')].filter((tr) => {
      const [code, , , price] = tr.children
      return code.scrollWidth > code.clientWidth + 1 || price.scrollWidth > price.clientWidth + 1
    }).length
    return { rows: el.querySelectorAll('tbody tr:not(.pg-section)').length, bands: [...el.querySelectorAll('.pg-section')].map((s) => s.textContent.trim()),
             ink: getComputedStyle(cell).color, bandBg: getComputedStyle(band).backgroundColor,
             landscape: [...document.querySelectorAll('style')].some((s) => /landscape/.test(s.textContent)),
             width: Math.round(table.getBoundingClientRect().width), overflowing }
  })
  await p.pdf({ path: `${SP}/usfoods-${store}.pdf`, format: 'Letter', landscape: true, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
  const n = pages(`${SP}/usfoods-${store}.pdf`)
  console.log(`  print: ${pr.rows} rows · ${pr.bands.length} bands · ink ${pr.ink} · band bg ${pr.bandBg} · landscape ${pr.landscape} · table ${pr.width}px · pages ${n}`)
  check(`${rows.length + 1} rows (the sheet + the added one) under the sheet's bands`, pr.rows === rows.length + 1 && pr.bands.join('|') === walk(rows).join('|'), pr.bands.join(' → '))
  check('black ink, grey bands, landscape', pr.ink === 'rgb(0, 0, 0)' && pr.bandBg === 'rgb(230, 230, 230)' && pr.landscape)
  check('table uses the landscape page', pr.width >= 900, `${pr.width}px`)
  check('no product # or price wraps', pr.overflowing === 0, `${pr.overflowing} rows overflow`)
  check(`at most ${MAX_PAGES[store]} pages`, n <= MAX_PAGES[store], `${n} pages`)
  await ctx.close()
}

// ---- migration: a Flowood device that already seeded Pearl's list ----------
// Before each store had its own sheet, Flowood seeded from Pearl's file under
// stamp 'v1'. Rebuild that state the way the old code left it — Pearl's items
// in the (shared) catalog, Pearl's flags and Pearl's layout copied under
// Flowood's keys, stamp 'v1' — plus a par and a hand-added item on Flowood.
{
  console.log('--- flowood: device that seeded Pearl\'s list before Flowood had a sheet ---')
  const pc = new Set(SHEETS.pearl.map((r) => r.code)), fc = new Set(SHEETS.flowood.map((r) => r.code))
  const pearlOnly = [...pc].filter((c) => !fc.has(c))
  const { ctx, p } = await newContext()
  await unlock(p, 'pearl')
  await openUsFoods(p) // seeds Pearl's list into the catalog
  const staged = await p.evaluate((pearlOnly) => {
    const k = (store, key) => `mugops:mugshots|${store}::${key}`
    localStorage.setItem(k('flowood', 'catalog:flags'), localStorage.getItem(k('pearl', 'catalog:flags')))
    localStorage.setItem(k('flowood', 'guide:sections:US Foods'), localStorage.getItem(k('pearl', 'guide:sections:US Foods')))
    localStorage.setItem(k('flowood', 'guide:seeded:usfoods'), JSON.stringify('v1'))
    // a par on a line both sheets carry, and one Beau added by hand
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items'))
    const cup = cat.find((c) => c.code === '728865')
    localStorage.setItem(k('flowood', 'catalog:pars'), JSON.stringify({ [cup.id]: { par: 4, onHand: 1 } }))
    const hand = { id: 'hand-added-1', name: 'Hand Added Thing', unit: 'cs', category: 'Food', vendor: 'US Foods', code: '5550001' }
    localStorage.setItem('mugops:mugshots|*::catalog:items', JSON.stringify([...cat, hand]))
    const flags = JSON.parse(localStorage.getItem(k('flowood', 'catalog:flags')))
    flags[hand.id] = true
    localStorage.setItem(k('flowood', 'catalog:flags'), JSON.stringify(flags))
    const layout = JSON.parse(localStorage.getItem(k('flowood', 'guide:sections:US Foods')))
    layout.find((s) => s.title === 'Bar').ids.push(hand.id)
    localStorage.setItem(k('flowood', 'guide:sections:US Foods'), JSON.stringify(layout))
    return { sections: layout.map((s) => s.title).join(' → '), pearlOnlyFlagged: pearlOnly.filter((c) => flags[cat.find((x) => x.code === c)?.id]).length }
  }, pearlOnly)
  console.log(`  staged: Flowood holds ${staged.sections} · ${staged.pearlOnlyFlagged}/${pearlOnly.length} Pearl-only lines on its guide`)
  await setStore(p, 'flowood')
  await openUsFoods(p)
  const g = await guide(p, [...pearlOnly.slice(0, 3), '5550001', '728865'])
  check("Flowood re-lays out from its own sheet", g.bands.join(' → ') === walk(SHEETS.flowood).join(' → '), g.bands.join(' → '))
  check(`${SHEETS.flowood.length} sheet lines + the hand-added one`, g.items === `${SHEETS.flowood.length + 1} items`, g.items)
  check('Pearl-only lines are off Flowood\'s guide', pearlOnly.slice(0, 3).every((c) => !g.has[c]), JSON.stringify(g.has))
  const hand = await whereIs(p, '5550001')
  check('the hand-added item survives, re-hung in the last section', !!hand && hand.band === 'Office', JSON.stringify(hand))
  const st = await p.evaluate(() => {
    const cat = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items'))
    const cup = cat.find((c) => c.code === '728865')
    return { par: JSON.parse(localStorage.getItem('mugops:mugshots|flowood::catalog:pars'))[cup.id], stamp: JSON.parse(localStorage.getItem('mugops:mugshots|flowood::guide:seeded:usfoods')) }
  })
  check('the Flowood par on a shared line survives', st.par?.par === 4, JSON.stringify(st.par))
  check("stamp is now Flowood's", st.stamp === 'flowood-v1', st.stamp)
  // Pearl on the same device: untouched
  await setStore(p, 'pearl')
  await openUsFoods(p)
  const gp = await guide(p, pearlOnly.slice(0, 3))
  check("Pearl's guide on the same device is untouched", gp.items === `${SHEETS.pearl.length} items` && pearlOnly.slice(0, 3).every((c) => gp.has[c]), `${gp.items} · ${JSON.stringify(gp.has)}`)
  await ctx.close()
}
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
