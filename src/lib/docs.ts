// Original imported documents (invoice PDFs, photos) live in IndexedDB —
// localStorage can't hold files. Each dropped file is saved once; records
// elsewhere (e.g. an invoice) keep a docId and can reopen the real document.

import { load, save } from './store'
import { useScope } from './scope'

const DB = 'mugops-docs'
const STORE = 'docs'
const KEEP = 60 // most-recent docs kept; older ones pruned

interface DocRecord {
  id: string
  name: string
  type: string
  blob: Blob
  at: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDoc(id: string, file: File): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ id, name: file.name, type: file.type, blob: file, at: Date.now() } satisfies DocRecord)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    void prune(db)
  } catch {
    /* private mode / no IDB — the app still works, just can't reopen docs */
  }
}

async function prune(db: IDBDatabase): Promise<void> {
  const all: DocRecord[] = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as DocRecord[])
    req.onerror = () => reject(req.error)
  })
  if (all.length <= KEEP) return
  const stale = all.sort((a, b) => b.at - a.at).slice(KEEP)
  const tx = db.transaction(STORE, 'readwrite')
  for (const s of stale) tx.objectStore(STORE).delete(s.id)
}

export async function getDoc(id: string): Promise<DocRecord | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as DocRecord) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// ── Duplicate detection ──────────────────────────────────────────────────
// Every processed drop is fingerprinted (SHA-256 of the bytes). A re-drop of
// the exact same file — invoice, spec card, recipe, any PDF — is flagged as a
// duplicate instead of silently importing twice.

export interface SeenFile {
  h: string
  name: string
  at: string // "Jul 13, 9:41 AM"
}

const seenKey = () => {
  const s = useScope.getState()
  return `${s.currentConcept}|${s.currentLocation}::imports:fileHashes`
}

/** SHA-256 hex of the file's bytes; '' when hashing isn't available. */
export async function fileHash(file: File): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

export function findSeenFile(h: string): SeenFile | undefined {
  if (!h) return undefined
  return load<SeenFile[]>(seenKey(), []).find((s) => s.h === h)
}

export function recordSeenFile(h: string, name: string): void {
  if (!h) return
  const at = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const list = [{ h, name, at }, ...load<SeenFile[]>(seenKey(), []).filter((s) => s.h !== h)]
  save(seenKey(), list.slice(0, 400))
}

/** Open the stored document in a new tab (the browser renders PDFs/images). */
export async function openDoc(id: string): Promise<boolean> {
  const rec = await getDoc(id)
  if (!rec) return false
  const url = URL.createObjectURL(rec.blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
