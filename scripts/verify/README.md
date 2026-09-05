# Verification scripts

Headless-browser checks that drive the built app and print what they find. Each
one was written to prove a specific fix rather than to be a test suite, so they
are named for the thing they check. Run from the repo root against a preview
server on port 4180:

```
npm run build
npx vite preview --port 4180 --strictPort &
node scripts/verify/verify3.mjs
```

Screenshots and PDFs land in `scripts/verify/out/` (ignored by git).

| Script | Proves |
| --- | --- |
| `verify3.mjs` | Catering row has no sideways scroll and Complete is in reach; Nightly has no inputs but the deposit; a checklist opens as a full-screen window, closes on Close and Escape |
| `fix2.mjs` | Printables' AM/PM checklist rows print real sections in black ink; the produce guide is landscape and exactly one page |
| `winprint.mjs` | The open checklist window prints black on white with the page behind it hidden |
| `inkaudit.mjs` | Contrast of every generated sheet under print media — catches white-on-white |
| `tapprint.mjs` | Tapping a name on Printables calls print exactly once and renders the right sheet |
| `pdfprint.mjs` | The hidden frame that prints shipped PDFs is laid out (not display:none) and doesn't print the empty parent |
| `produce.mjs` | The produce order guide seeds on both stores with the right M/F pars |
| `addflow.mjs` | Prep list Add item opens inside its section and lands the item there |
| `badge.mjs` | No count pill left in the rail; Checklists still reports due state |
| `usfoods.mjs` | Each store's US Foods guide seeds from its own sheet (`src/data/usfoods-guide-<store>.json`) in sheet-to-shelf order with product numbers; the copy-out carries them; adding on the tab lands the item in its section with the vendor set; an item moves by tap (up, and to another section); the printed sheet is landscape, full-width, black ink, grey storage bands, nothing wrapped mid-number, within the page budget; and a Flowood device that seeded Pearl's list before Flowood had a sheet migrates (Pearl-only lines off, layout rebuilt, pars and hand-added items kept, Pearl untouched). Exits non-zero on any failure |

| `liquorprices.mjs` | The Lincoln Road receipt prices land on the right catalog items on both stores, with the vendor's spelling kept as an alias and no double-pricing on re-open |
| `ezcater.mjs` | An ezCater PDF dropped on Imports creates a booking pointing at the stored file, the order window shows it, and the print job contains the caterer's own page and nothing else |
| `roster.mjs` | The weekly employee import updates people instead of duplicating them — a re-drop adds nobody, a rename with the same GUID stays one person, a leaver is kept and reported, and another store's export lands nobody here |
| `schedule.mjs` | The manager schedule is built from the roster's Managers / Shift Leads / Keys, names each day's opener and closer, counts uncovered days, flags clopens and weekend-day-off shortfalls, and Posted leads with who is on today |
| `schedule2.mjs` | The schedule can actually be built: a locked square asks for the PIN, the PIN unlocks it, tapping a day's slot assigns somebody, coverage only clears with both an opener and a closer, and "Who's on it" narrows the board to the people who run the building |
| `printables.mjs` | Every printable, audited: what is on the page, black ink, no clipped cells, no app chrome, page count, one print job per tap — plus Orders' Print button producing the ruled sheet rather than the screen |

The seeds themselves come from `scripts/usfoods-sheet-to-json.py` — one US Foods
"Sheet to Shelf" CSV in, one JSON out; see its docstring.

`roster.mjs` and `schedule.mjs` build their fixtures from the real Toast export
in the uploads directory; regenerate `scripts/verify/out/_roster-w{1,2}.csv`
with the snippet in the worklog if they're missing.

Assumptions: Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
an admin day-code unlock written straight to localStorage, business day rolls
at 4am. See `docs/worklog.md` for what each run was checking and when.
