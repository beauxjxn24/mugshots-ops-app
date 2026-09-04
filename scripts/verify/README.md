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

Assumptions: Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
an admin day-code unlock written straight to localStorage, business day rolls
at 4am. See `docs/worklog.md` for what each run was checking and when.
