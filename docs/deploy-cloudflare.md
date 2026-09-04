# Moving the app to Cloudflare Pages and making the repo private

Why: the repo is public and carries real sales history, recipes and pars.
GitHub Pages only serves private repos on a paid plan. Cloudflare Pages is
free, serves private repos, and `runthepass.app` is already registered and
DNS-hosted at Cloudflare — so the domain move is one click inside the same
dashboard.

**The order matters.** Cloudflare has to be live and serving the domain before
the repo goes private. Private first on a free plan turns GitHub Pages off and
the site goes dark until Cloudflare is up.

The app needs nothing changed to run there: hash routing (no server rewrites
needed), relative asset paths (`base: './'`), Node pinned by `.nvmrc`, and the
`public/_redirects` SPA fallback already in place.

---

## 1. Connect the repo (Cloudflare dashboard, ~3 minutes)

1. `dash.cloudflare.com` → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Authorise the Cloudflare GitHub app if asked. Grant it access to
   **beauxjxn24/mugshots-ops-app** (it can be limited to just that repo).
3. Pick the repo. Build settings:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | Vite (or None — the two fields below are what matter) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Node version | picked up from `.nvmrc` (22) — no setting needed |

4. **Save and Deploy.** First build takes a minute or two. You get a
   `<project>.pages.dev` address — open it and confirm the app loads and the
   build stamp in the bottom-left of the rail is today's.

From here, every push to `main` deploys automatically, same as before.

## 2. Move the domain (same dashboard, ~1 minute)

1. In the Pages project → **Custom domains** → **Set up a custom domain** →
   `runthepass.app`.
2. Because the zone is on Cloudflare, it offers to create or update the DNS
   record itself. Accept. It will replace the records currently pointing at
   GitHub Pages.
3. Wait for the domain to show **Active** (usually under a minute; the
   certificate is automatic). Open `https://runthepass.app` — the build stamp
   should match the `pages.dev` one.

If you also use `www.runthepass.app`, add it the same way.

## 3. Make the repo private (GitHub, ~1 minute — only you can do this)

GitHub → repo → **Settings** → **General** → scroll to **Danger Zone** →
**Change visibility** → **Private** → type the repo name to confirm.

(The session's GitHub token is read-only on this repo — checked — so this one
is yours. Do it only after step 2 shows Active.)

## 4. Tidy up (Claude does this once you confirm step 2)

- Delete `.github/workflows/deploy.yml` — the GitHub Pages pipeline. On a
  private free repo it would fail on every push, and it now deploys to a place
  nothing points at.
- Turn off GitHub Pages on the repo so it stops holding the custom domain.
- Record the cutover in `docs/worklog.md`.

## What does not change

- The address: `runthepass.app`.
- Deploy-on-push to `main`.
- Anything on the tablets. Data lives on each device; hosting is only where the
  app's code is downloaded from.

## What this does and does not protect

Private stops anyone reading the source, the data files and the history on
GitHub. It does **not** stop someone who has the URL from loading the app —
the sales seed data, recipes and pars are inside the JavaScript the browser
downloads, and the day code is a front door, not a lock on that data. Putting
the data behind a real login is the Supabase work on the October list.
