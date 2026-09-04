// Proves: the US Foods guide seeds on both stores in sheet-to-shelf order with
// product numbers; the copy-out carries the numbers; US Foods items do not also
// land on "Food & other"; adding an item on the tab lands it in the section it
// was added to (with its product number and the vendor set — it used to vanish);
// an item moves by tap, a step up and to the end of another section; and the
// Printables sheet prints multi-page, landscape, in black ink with the storage
// bands, at the page's full width so nothing wraps mid-number.
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

for (const store of ['pearl', 'flowood']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    window.__copied = ''
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true })
    window.__prints = 0; window.print = () => { window.__prints++ }
  })
  await p.goto('http://localhost:4180/', { waitUntil: 'domcontentloaded' })
  await p.evaluate(({ bd, store }) => {
    localStorage.setItem('mugops:__staffUnlockedOn', JSON.stringify(bd))
    localStorage.setItem('mugops:__lastSeen', JSON.stringify(Date.now()))
    localStorage.setItem('mugops:__role', JSON.stringify('admin'))
    const sc = JSON.parse(localStorage.getItem('mugops:__scope') || '{}')
    localStorage.setItem('mugops:__scope', JSON.stringify({ ...sc, currentConcept: 'mugshots', currentLocation: store }))
  }, { bd, store })
  await p.goto('http://localhost:4180/#/ordering', { waitUntil: 'networkidle' }); await p.waitForTimeout(1800)

  const tabs = await p.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /^(Liquor|Beer|Produce|US Foods|Food & other)$/.test(t)))
  console.log(`--- ${store} --- tabs: ${tabs.join(' | ')}`)
  check('US Foods tab present', tabs.includes('US Foods'))
  check('no "Food & other" (USF items not double-listed)', !tabs.includes('Food & other'))

  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(700)
  const g = await p.evaluate(() => {
    const t = document.body.innerText
    const bands = [...document.querySelectorAll('span')].filter((s) => /^(NEW DRY STORAGE|WALKIN COOLER|FREEZER|SERVERS LINE|BAR|TO GO|OFFICE)\b/i.test(s.textContent.trim())).map((s) => s.textContent.trim().split(/\s\d/)[0])
    return { bands, items: (t.match(/\d+ items/) || [])[0], firstCode: t.includes('#728865'), lastCode: t.includes('#8523581'), brand: t.includes('MONOGRAM') }
  })
  check('sections in walk order', g.bands.join(' → ') === 'New Dry Storage → Walkin Cooler → Freezer → Servers Line → Bar → To Go → Office', g.bands.join(' → '))
  check('header count', g.items === '187 items', g.items)
  check('first and last product # shown, brand on pack line', g.firstCode && g.lastCode && g.brand)

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
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(600)
  await p.locator('button', { hasText: /^Copy order/ }).first().click(); await p.waitForTimeout(400)
  const copied = await p.evaluate(() => window.__copied)
  check('copy-out carries product #', /2 cs · #728865 — Cup, Foam 12 Oz White/.test(copied), JSON.stringify(copied.split('\n').slice(0, 2).join(' / ')))
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-orders.png` })

  // ---- add an item to the Bar section, product number first --------------
  const whereIs = async (code) => p.evaluate((code) => {
    const chip = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === `#${code}`)
    if (!chip) return null
    const row = chip.closest('.group')
    const section = row.parentElement.parentElement
    const band = section.querySelector('span').textContent.trim().split(/\s\d/)[0]
    const rows = [...section.querySelectorAll('.group')]
    return { band, idx: rows.indexOf(row), count: rows.length }
  }, code)
  await p.locator('button[title="Add an item to Bar"]').click(); await p.waitForTimeout(200)
  await p.locator('input[placeholder="product #"]').fill('9990001')
  await p.locator('input[placeholder="New Bar item — Enter to add"]').fill('Test Widget, Case Of Twelve')
  await p.keyboard.press('Enter'); await p.waitForTimeout(500)
  const added = await whereIs('9990001')
  check('added item lands at the end of Bar with its product #', !!added && added.band === 'Bar' && added.idx === added.count - 1, JSON.stringify(added))
  const cat = await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('mugops:mugshots|*::catalog:items') || '[]').find((x) => x.code === '9990001')
    return c ? { vendor: c.vendor, category: c.category, unit: c.unit } : null
  })
  check('catalog item is US Foods', cat?.vendor === 'US Foods', JSON.stringify(cat))

  // ---- move it by tap: one up, then to the end of Office ------------------
  await p.locator('.group', { hasText: '#9990001' }).locator('button[title="Click to edit this item"]').click(); await p.waitForTimeout(300)
  await p.locator('button[title="Move up"]').click(); await p.waitForTimeout(400)
  const up = await whereIs('9990001')
  check('Move up steps it one row up inside Bar', !!up && up.band === 'Bar' && up.idx === added.idx - 1, JSON.stringify(up))
  await p.locator('select[aria-label="Move to section"]').selectOption({ label: 'Office' }); await p.waitForTimeout(400)
  const moved = await whereIs('9990001')
  check('Move to section puts it at the end of Office', !!moved && moved.band === 'Office' && moved.idx === moved.count - 1, JSON.stringify(moved))
  check('the edit panel followed the item', await p.locator('button[title="Move up"]').count() === 1)
  if (store === 'pearl') await p.screenshot({ path: `${SP}/usfoods-move.png`, fullPage: false })
  // the product # is editable on this guide
  const codeField = p.locator('label', { hasText: 'Product #' }).locator('input')
  check('edit panel offers the product #', (await codeField.inputValue()) === '9990001')
  await codeField.fill('9990002'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
  check('product # edit saved', !!(await whereIs('9990002')))
  // reload: the layout and the vendor persist
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
  await p.locator('button', { hasText: /^US Foods$/ }).first().click(); await p.waitForTimeout(600)
  const after = await whereIs('9990002')
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
    return { rows: el.querySelectorAll('tbody tr:not(.pg-section)').length, bands: el.querySelectorAll('.pg-section').length,
             ink: getComputedStyle(cell).color, bandBg: getComputedStyle(band).backgroundColor,
             landscape: [...document.querySelectorAll('style')].some((s) => /landscape/.test(s.textContent)),
             width: Math.round(table.getBoundingClientRect().width), overflowing }
  })
  await p.pdf({ path: `${SP}/usfoods-${store}.pdf`, format: 'Letter', landscape: true, printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })
  const n = pages(`${SP}/usfoods-${store}.pdf`)
  console.log(`  print: ${pr.rows} rows · ${pr.bands} bands · ink ${pr.ink} · band bg ${pr.bandBg} · landscape ${pr.landscape} · table ${pr.width}px · pages ${n}`)
  check('188 rows (187 + the added one) under 7 bands', pr.rows === 188 && pr.bands === 7)
  check('black ink, grey bands, landscape', pr.ink === 'rgb(0, 0, 0)' && pr.bandBg === 'rgb(230, 230, 230)' && pr.landscape)
  check('table uses the landscape page', pr.width >= 900, `${pr.width}px`)
  check('no product # or price wraps', pr.overflowing === 0, `${pr.overflowing} rows overflow`)
  check('at most 8 pages', n <= 8, `${n} pages`)
  await ctx.close()
}
await b.close()
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
