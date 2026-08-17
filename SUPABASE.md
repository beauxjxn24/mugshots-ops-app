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
