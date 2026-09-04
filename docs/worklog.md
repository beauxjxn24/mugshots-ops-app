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

### Open

- **Pars on the produce guide** are transcribed from a photo — Beau is verifying
  them. Both stores hold separate copies; correct each.
- **US Foods invoice** — Beau imported one and wants to know where it landed and
  whether it produced an order guide. Being traced.
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
