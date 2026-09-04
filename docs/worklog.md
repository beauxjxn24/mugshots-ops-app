# The Pass — worklog

A running, dated record of what changed, why, what was checked, and what is
still open. Kept in the repo so it can be found and tracked; the newest entry is
at the top. Verification scripts referenced here live in `scripts/verify/`.

Conventions: **Done** is verified in a browser, not just built. **Open** is
something known and not yet done. **Decision** is a call that was made and why,
so it isn't re-litigated later.

---

## 2026-09-04

### Done

- **Catering — orders in reach.** The bookings table was an eight-column grid
  pinned to 900px inside a ~660px card, so Status / Order / Complete sat past the
  right edge and needed a sideways scroll. Now a two-line row per booking with
  Order and Complete pinned right, no minimum width. Verified at 1180px: no
  overflow, Complete on screen, tapping it closes the booking out.
- **Nightly Numbers — read-only except the deposit.** Removed the Nightly Log
  (six text boxes + MOD picker that composed the recap email) and the notes
  field. The only input left is *Actual deposit* with its own Save. Date pickers
  remain: they choose the night, they don't enter data. *Decision:* the recap
  email feature is deleted, not hidden — recoverable from git if wanted.
- **Checklists — open as a window.** AM/PM/Weekly/Period are four large doors;
  tapping one opens the list full-screen with its name across the top, count,
  Edit, Print, Close. Escape closes; page scroll locks behind it. Fixed print
  from that window: it was white-on-white (1.20:1) and the page behind printed
  too. Now a print-only ink rule (`.print-paper`) — 21:1, nothing bleeds through.
- **Printables — checklist rows were reading a dead key.** `checklists:data`
  (Opening/Closing/Weekly) is not what the Checklists screen writes; it writes
  AM/PM/Weekly/Period under `checklists:sections:v2`. Every row said "0 tasks"
  and printed blank. Rows now read the live key and print all four phases as
  sections with checkboxes.
- **Produce order guide — landscape, one page.** Sheet sets `@page landscape`
  only while it is the print job; always exactly 20 rows (items + spare) at 30px
  so it lands on one page with margin for any printer.
- **US Foods order guide — per vendor, from Beau's own sheet.** Built from
  `Pearl_2026_Sheet_to_Shelf.csv`, the US Foods export he orders from: 187
  lines in the sheet's walk order — New Dry Storage → Walkin Cooler → Freezer →
  Servers Line → Bar → To Go → Office — each with product number, pack, brand
  and case price (`src/data/usfoods-guide.json`). Its own **US Foods** tab on
  Orders: guides were per shelf, this one is per vendor (`VENDOR_GUIDES` in
  `guide.ts`; `onShelf` now takes the vendor), so US Foods lines no longer
  fall into "Food & other". Copy order carries the product number
  (`2 cs · #728865 — Cup, Foam 12 Oz White`). Seeded on **both stores from
  Pearl's file**; Flowood gets its own list the moment Beau sends that sheet.
  Pars start at 0. Printables: "US Foods order guide" prints landscape, 8
  pages, storage bands in grey, product number first, 8 write-in boxes a line.
  Verified by `scripts/verify/usfoods.mjs`.
- **Flowood's own US Foods sheet.** Beau sent `Flowood_Sheet_to_Shelf.csv`
  the same evening: 226 lines in nine storage areas — Chemical → Dry Storage →
  Server Room → Walk-In → Freezer → To Go → Expo Line → Liquor Closet → Office
  (US Foods' "-New" suffix on the group names dropped). 173 lines are on both
  stores' sheets at identical prices, 53 are Flowood-only, 14 Pearl-only. Each
  store now seeds from its own file (`src/data/usfoods-guide-<store>.json`,
  `USFOODS_SHEETS` in `guide.ts`); the converter
  `scripts/usfoods-sheet-to-json.py` is in the repo and reproduces Pearl's
  committed seed exactly, so the next sheet is one command. A Flowood tablet
  that already opened Orders today holds Pearl's list under the old stamp; on
  its next open it migrates — the 14 Pearl-only lines come off Flowood's
  guide, the layout is rebuilt from Flowood's sheet, pars and hand-added lines
  survive, and Pearl's guide on the same device is untouched. `usfoods.mjs`
  now drives both stores and that migration. Flowood's sheet prints on 10
  pages.
- **Add and move on the guide** (Beau: "needs to have the ability to add
  items and move them when i want to"). Adding on the US Foods tab was a silent
  no-op: `addGuideItem` registered the item under category "US Foods" with no
  vendor, and a vendor guide finds its items *by vendor*, so the new line was
  filtered out before it ever rendered. A vendor guide's add now sets the
  vendor and takes the product number first. Moving: the drag grip stays for a
  mouse; the edit panel gains ▲ ▼ and a "move to section" picker for a finger
  on a tablet, and the product number is editable there. The dashboard's US
  Foods link opens the tab instead of filtering the liquor shelf to nothing.
- **Print sheets were getting a portrait column's width.** Printables renders
  the sheet inside the page's `max-w-3xl` column, so a landscape sheet had
  730px of a 979px page and seven-digit product numbers broke in half
  ("984281 / 5"), prices too. In print, everything between `main` and the
  sheet now lets go of its width and side padding. The produce guide's boxes
  got wider as a result; still one page. Re-ran fix2, produce, winprint,
  pdfprint, inkaudit, tapprint: no regressions. (inkaudit and tapprint were
  still looking for "Opening/Closing checklist" from before the AM/PM rename
  and had been failing on that, not on anything real — fixed.)

### Found

- **`mugshots-ops-app` is public** (`mugshots-daily-ops` is private). Exposed:
  30 nights of 2026 sales with labor, 14 of 2025, every recipe, pars, both
  order guides, the checklists. Not exposed: any credential — none in the tree
  or in history. Nothing is changeable by an outsider; there is no shared
  backend. Note the deployed bundle carries the same data regardless of repo
  visibility; a real fix is data behind a login (Supabase, October list).
- **US Foods invoice — where it lands.** Nothing lands until the Receiving
  sheet's post button is pressed (locked while any line is undecided). Then:
  the invoice on Invoices; each line into the Item Catalog under vendor US
  Foods with case price; on-hand bumped. On Orders there is no per-vendor
  guide — guides are per shelf — so lines appear under a **"Food & other"**
  tab that only exists once such items do; produce-keyword lines go to the
  Produce tab. *Superseded the same day:* US Foods lines now have their own
  tab (see the US Foods guide under Done); a received invoice's new lines
  append to that guide's last section, drag or move them where they belong.

### Open

- **Cloudflare Pages cutover + private repo** — Beau's call, made 2026-09-04.
  Runbook in `docs/deploy-cloudflare.md`. Sequence: Cloudflare live → domain
  → private. Both dashboard steps are Beau's (no Cloudflare credentials here;
  GitHub token is read-only on the repo). Claude removes the GitHub Pages
  workflow once step 2 is confirmed. Beau could not find "Workers & Pages" in
  his dashboard: it is **Compute (Workers)** under **Build** in the 2026
  sidebar, and the runbook now carries a direct link that skips the menu.
- **Next US Foods sheet from either store:** `python3
  scripts/usfoods-sheet-to-json.py <csv> > src/data/usfoods-guide-<store>.json`,
  bump that store's stamp in `USFOODS_SHEETS`, ship. Devices re-seed on their
  next open; pars and hand-added lines survive.
- **Guide sections are fixed** — the seven storage areas from the sheet. Items
  add and move freely; adding or renaming a storage area is not in the app.
  Say if it's needed.
- **Pars on the US Foods guide** are 0 until set. **Pars on the produce guide**
  are transcribed from a photo — Beau is verifying them. Both stores hold
  separate copies; correct each.
- 120 spec cards still read "source not recorded" (provenance field added
  2026-08-30). Unverified ≠ wrong; work through when there's time.

---

## 2026-08-30

### Done

- Salad Mix: confirmed by Beau as the store recipe (6 iceberg / 3 romaine / 1 lb
  spring mix → 3 bags). No company prep sheet exists; the app is the written
  copy. Added to the prep sheet (after Romaine, in bags) with starting pars
  6/6/6/6/9/12/6, migration for devices that already had a sheet. Printable
  prep card in the company layout, sub-recipes pulled in live.
- Spec cards gained a `doc` (provenance) field; 63 traced to a source document.
- Graphite retheme: aurora removed, one accent (#6c8cff), tabular numerals,
  monochrome nav, decorative two-tone icons removed (413 lines).
- Prep list: Add item lives inside each section (no section dropdown).
- Checklist nav badge removed at Beau's request.
- Produce order guide on both stores with M-PAR / F-PAR (Mon–Thu counts against
  M, Fri–Sun against F). Confirmed: they order Monday and Friday.
- Printables rebuilt as a tap-to-print list; Mini Mugs placemat and Employment
  Application ship with the app (`public/sheets/`). Fixed PDFs printing blank
  (a `display:none` iframe has nothing to print).

### Decision

- Domain `runthepass.app` is at **Cloudflare Registrar**, paid through
  2027-08-04, auto-renew on. DNS and email routing are there too.
