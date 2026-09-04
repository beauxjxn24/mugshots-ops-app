import pw from 'playwright-core'
const { chromium } = pw
const SP='scripts/verify/out'
const bd=(()=>{const d=new Date(); if(d.getHours()<4)d.setDate(d.getDate()-1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'})
const p=await b.newPage({viewport:{width:1440,height:1100}})
await p.goto('http://localhost:4180/',{waitUntil:'domcontentloaded'})
await p.evaluate((bd)=>{localStorage.setItem('mugops:__staffUnlockedOn',JSON.stringify(bd))
  localStorage.setItem('mugops:__lastSeen',JSON.stringify(Date.now()))
  localStorage.setItem('mugops:__role',JSON.stringify('admin'))},bd)
await p.goto('http://localhost:4180/#/prep',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)

const txt = await p.evaluate(()=>document.body.innerText)
console.log('global add bar gone:', !txt.includes('Add prep item'))
const addBtns = p.locator('button', { hasText: /^Add item$/ })
console.log('per-section Add buttons:', await addBtns.count(), '(expect 3)')

// open the LTO one specifically — the section furthest from where the old bar was
const ltoAdd = addBtns.nth(2)
await ltoAdd.click(); await p.waitForTimeout(400)
const ph = await p.locator('input[placeholder^="Add to"]').first().getAttribute('placeholder')
console.log('box is scoped to its section:', ph)
console.log('open boxes (must be 1):', await p.locator('input[placeholder^="Add to"]').count())
console.log('no section dropdown in the box:', !(await p.locator('select').filter({hasText:'Test items'}).count()))

await p.fill('input[placeholder^="Add to"]', 'Pickled Red Onions')
await p.fill('input[placeholder^="Pan spec"]', 'Clear 1/6 pan')
await p.keyboard.press('Enter'); await p.waitForTimeout(600)

const stored = await p.evaluate(()=>JSON.parse(localStorage.getItem('mugops:mugshots|flowood::prep:items')||'[]'))
const row = stored.find(i=>i.name==='Pickled Red Onions')
console.log('added:', !!row, '| landed in section:', row && row.section, '| spec:', row && row.spec)
console.log('confirmation shown:', (await p.evaluate(()=>document.body.innerText)).includes('Added'))
console.log('box stays open for the next one:', await p.locator('input[placeholder^="Add to"]').count() === 1)
await p.screenshot({path:SP+'/addflow.png'})
await b.close()
