# The Pass — worklog

A running, dated record of what changed, why, what was checked, and what is
still open. Kept in the repo so it can be found and tracked; the newest entry is
at the top. Verification scripts referenced here live in `scripts/verify/`.

Conventions: **Done** is verified in a browser, not just built. **Open** is
something known and not yet done. **Decision** is a call that was made and why,
so it isn't re-litigated later.

---

## 2026-09-05

### Done

- **Park, instead of "off guide" or delete.** An item now parks: off every
  order guide, kept whole on a **Parked** shelf in the Item Catalog with its
  price, vendor, product number and the invoice spellings it has learned. Park
  button on every catalog item and in the Orders editor; the guide flag is
  left untouched, so un-parking puts the item back where it was. Deleting is
  still there and now says what it costs you.
- **Pearl mirrors Flowood's US Foods guide**, as asked — one list to maintain,
  then move / add / park per store. A Pearl device holding the old list
  re-seeds: the 14 lines only Pearl's sheet carried are **parked**, not
  dropped; pars survive; hand-added lines are left alone. Pearl's own sheet
  stays at `src/data/usfoods-guide-pearl.json` — point `USFOODS_SHEETS.pearl`
  back at it and bump the stamp to undo.
- **US Foods guide takes two pars** (M and F) like the produce sheet, on
  screen and on paper, and the printed sheet now reads like the produce guide:
  same band, same ruled grid, M-PAR / F-PAR, then the count boxes.
- **The shipped documents print again.** They were blank because the service
  worker answered their navigation with the app shell — an iframe pointed at a
  PDF loaded The Pass and printed an empty page. `/sheets/` and `.pdf` now
  bypass the SPA fallback (`navigateFallbackDenylist`) and are cached once
  opened. *This was mine: the SW was configured without a denylist.*
- **Liquor prices from the two Lincoln Road receipts** (9/1 and 8/26) →
  `src/data/liquor-prices-lincoln-road.json`, 26 bottles priced with the
  store's item code and bottle size, the vendor's spelling kept as an alias so
  the next invoice import matches itself. Both receipts' line prices sum
  exactly to their printed totals, so these are the receipts' numbers. Two
  bottles the guide never had (New Amsterdam Vodka, Cook's Brut) were created
  and filed.
- **The ezCater order prints as the caterer's page on every device.** It
  already opened the imported PDF, but only Chrome will print one out of a
  frame; an iPad won't render it and Safari blocks `print()` on the viewer —
  which is where the kitchen prints from. Pages are rendered with pdf.js and
  those images are the print job (`src/lib/pdfpages.ts`).
- **Weekly employee imports stopped being able to duplicate anyone.** The
  importer matched on the name and ignored Toast's GUID and Employee ID, so a
  marriage added a second person and two people sharing a name collapsed into
  one. Now GUID → employee number → normalized name (case, punctuation,
  accents, "Last, First" all folded). Nobody is ever removed: people missing
  from this week's export are listed instead. Rosters that already doubled get
  a "Merge them" button on Staff. A multi-store export no longer puts
  Flowood's team on Pearl's roster — and says so rather than doing nothing.
- **Manager schedule + Posted overhauled.** Rows came from Admin → Users, so a
  66-person team with 8 managers showed as one line. They now come from the
  roster (Manager / Shift Lead / Key) plus Users. The build tab answers the
  question it exists for — a coverage row naming each day's opener and closer,
  red where there is none, and "N days uncovered" in the header — and the
  balance card checks the period rules by name, including clopens across week
  boundaries. Posted opens with who is on today.

- **Every order guide prints the same sheet.** `components/GuideSheet` renders
  any shelf and picks its own columns (product number where the vendor prints
  one, price where known, M-PAR/F-PAR where ordered twice a week, section
  bands from the store's layout, count boxes filling the rest). Liquor and Beer
  join Produce and US Foods in Printables — a guide with nothing on it is not
  offered — and Orders' Print button prints that sheet instead of the screen.
  `scripts/verify/printables.mjs` audits all 20 printables: content, black ink,
  no clipped cells, no app chrome, page count, one print job per tap.
- **Sidework**: duties drag between and within tiles (grip in edit mode; the
  filter is off while editing because edits write by index); closing filters to
  one cut, defaulting to the reader's own, so a server sees their eight jobs
  instead of thirty-two; name pickers offer tonight's Tipshare crew first; and
  a tile no longer takes a name at close, where cuts are the model.
- **Copy buttons** split by vendor only when two vendors are actually named.
- **Manager schedule** rebuilt around the day: Opening / Mid / Closing slots per
  day card, red where nobody is on, "Who's on it" so the GM picks the four who
  run the building rather than everyone Toast codes as a manager, and a locked
  square that asks for the PIN instead of ignoring the tap. The grid is behind
  a toggle.

### Found

- **The GM PIN is the owner PIN** in Admin → Users & PINs (default 2424 on a
  device that has never changed it). Nothing on the schedule said so, which is
  most of why "I can't type in the squares".
- **No access to usfoods.com from this session** — the environment's proxy
  refuses the connection (403 on CONNECT to `usfoods.com` and
  `order.usfoods.com`). Ordering through their site has to be Beau's hands, or
  a paid API integration Beau arranges with his rep.

### Open

- Pars on the US Foods guide are 0 until set — and now there are two per item
  (M and F) on both stores.
- The Cloudflare cutover is still waiting on Beau's two dashboard steps.

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
