# Backend notes

The app runs entirely on-device until `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set. Nothing below is live yet.

## The one table

Every screen stores whole JSON blobs under a namespaced key, so one table
models all of it — there is no need for forty schemas.

```sql
create table kv (
  key         text primary key,   -- "mugshots|flowood::prep:items"
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table kv enable row level security;
```

The key already carries the store (`concept|location::name`), so per-store
access rules are a prefix match on it.

## Writes: offline first

`lib/store.ts` writes to the device and then calls `queue(key)` in
`lib/outbox.ts`. The device write always happens, signal or not — a count
typed in the walk-in is safe the moment it's typed.

The queue holds **keys, not values**. Each write replaces a whole blob, so the
only version worth sending is whatever the device holds when the connection
returns: five corrections to one count send one row, and the row that goes up
is the corrected one. A failed key stays queued and the retry backs off.

`SyncBadge` shows "No signal · N waiting" so nobody re-enters a count they
already typed.

## Reads: not built

Pulling the server's copy down is the remaining half, and it needs a rule per
kind of data:

- **Last-write-wins is fine** for the read-mostly lists — recipes, prep list,
  catalog, sidework sheets, pars. These are the ones where device drift has
  actually caused problems, so sync these first.
- **Last-write-wins loses records** for anything that accumulates: tipshare
  shifts, petty cash counts and log, invoices, maintenance log, catering
  bookings, prep count history. Two devices holding different real entries must
  be merged by record, not overwritten by whoever wrote last. Leave these local
  until that's built.

## Before switching a device on

The one-time migrations in `Prep.tsx` (`RETIRED_PREP`, `ADDED_PREP`,
`specsVer`) and the sidework sheet reset exist because each device holds its
own copy of the shipped data. They have to run on a device **before** it syncs,
or it will upload a stale list as the shared truth. Don't remove them until
every device has opened the app at least once on this build.

## The local-events fetcher

The Dashboard ticker is a hand-typed list. The sources it should be fed from
are settled in `src/lib/eventsources.ts` and configured per store on
Connections; this is the server half that hasn't been built.

**Shape.** A fetcher writes `LocalEvent` (`src/lib/events.ts`) with `from` set
to the source id. `from` is what keeps a fed event apart from a typed one, and
it decides what happens when a manager taps the ✕: a typed event is deleted, a
fed one is only marked `hidden` — delete it outright and the next run puts it
straight back, which is how a dismiss button becomes a thing nobody trusts.

**Read them server-side.** These are public pages, not APIs, and several of
them sit behind hosts an app egress proxy blocks. The fetcher runs on the
server for that reason, not just for the schedule.

**One adapter covers most of the chambers.** Flowood, Rankin County, Madison
County, Greater Jackson and Clinton all run ChamberMaster/MicroNet portals on
`business.*` / `members.*` subdomains with the same calendar structure. Write
that reader once. Pearl (`pearlms.org`) and Ridgeland run their own sites and
need their own.

**Cadence is per source, not global.** A season schedule (Trustmark Park) and a
school-year calendar publish once and are then static — read them monthly. A
chamber calendar is worth a daily read. Weather is hourly and is the only one
here with a real API (`api.weather.gov`, free, no key).

**Dedupe across sources, not within one.** The same festival will come off a
chamber calendar and a venue page under two slightly different names. Key on
`date` plus a normalised name, and prefer the venue's version — it has the
times.

**Relevance is distance.** Every source carries rough `miles`. A sell-out eight
miles away and one thirty miles away are not the same event, and a ticker that
treats them alike gets ignored. Rank before truncating.

**The inbox watcher is last, and separately.** It's the only source that
touches private mail. It needs a granted scope and the same token rule as every
other connection — the token stays on the server, never on the device (see
`src/lib/connections.ts`).
