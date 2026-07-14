// Original imported documents (invoice PDFs, photos) live in IndexedDB —
// localStorage can't hold files. Each dropped file is saved once; records
// elsewhere (e.g. an invoice) keep a docId and can reopen the real document.

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

/** Open the stored document in a new tab (the browser renders PDFs/images). */
export async function openDoc(id: string): Promise<boolean> {
  const rec = await getDoc(id)
  if (!rec) return false
  const url = URL.createObjectURL(rec.blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
