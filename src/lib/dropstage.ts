// Files dropped somewhere other than the Imports screen.
//
// A report arrives while someone is looking at the dashboard, and making them
// find Imports first is how a report ends up sitting in an inbox instead. The
// drop is accepted where they are; the file waits here for the Imports screen
// to pick it up a moment later, so the reading and the review still happen in
// one place rather than being written twice.
//
// Deliberately in memory and not in storage: a File can't be serialised, and a
// file that outlived the navigation would be a stale import waiting to happen.

let staged: File[] = []

export function stageFiles(files: FileList | File[]): void {
  staged = Array.from(files)
}

/** Take whatever is waiting, and clear it — read once, never twice. */
export function takeStaged(): File[] {
  const out = staged
  staged = []
  return out
}

export const hasStaged = (): boolean => staged.length > 0
