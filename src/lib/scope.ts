import { create } from 'zustand'
import { load, save } from './store'

export interface Loc {
  id: string
  name: string
}
export interface Concept {
  id: string
  name: string
  locations: Loc[]
}

// The two concepts. Locations are editable in Stores & Concepts.
const VICIOUS_BISCUIT: Concept = {
  id: 'vicious-biscuit',
  name: 'Vicious Biscuit',
  locations: [
    { id: 'vb-1', name: 'Location 1' },
    { id: 'vb-2', name: 'Location 2' },
    { id: 'vb-3', name: 'Location 3' },
  ],
}
const DEFAULT_CONCEPTS: Concept[] = [
  { id: 'mugshots', name: 'Mugshots Grill & Bar', locations: [{ id: 'flowood', name: 'Flowood, MS' }] },
  VICIOUS_BISCUIT,
]

interface Persisted {
  concepts: Concept[]
  currentConcept: string
  currentLocation: string
}
const saved = load<Persisted | null>('__scope', null)
let initConcepts = saved?.concepts?.length ? saved.concepts : DEFAULT_CONCEPTS
// One-time: make sure Vicious Biscuit exists for existing installs too.
if (!load<boolean>('__vbSeeded', false)) {
  if (!initConcepts.some((c) => c.id === 'vicious-biscuit')) {
    initConcepts = [...initConcepts, VICIOUS_BISCUIT]
  }
  save('__vbSeeded', true)
}
const initConcept =
  initConcepts.find((c) => c.id === saved?.currentConcept)?.id ?? initConcepts[0].id
const initLocation =
  initConcepts.find((c) => c.id === initConcept)?.locations.find((l) => l.id === saved?.currentLocation)
    ?.id ?? initConcepts.find((c) => c.id === initConcept)?.locations[0]?.id ?? ''
// Persist immediately so the seeded concepts survive without an interaction.
save('__scope', { concepts: initConcepts, currentConcept: initConcept, currentLocation: initLocation })

let idSeq = 0
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${idSeq++}`
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || uid('x')

interface ScopeStore extends Persisted {
  setCurrent: (conceptId: string, locationId: string) => void
  addConcept: (name: string) => void
  addLocation: (conceptId: string, name: string) => void
  renameConcept: (conceptId: string, name: string) => void
  renameLocation: (conceptId: string, locId: string, name: string) => void
  removeLocation: (conceptId: string, locId: string) => void
}

export const useScope = create<ScopeStore>((set, get) => {
  const persist = () => {
    const { concepts, currentConcept, currentLocation } = get()
    save('__scope', { concepts, currentConcept, currentLocation })
  }
  return {
    concepts: initConcepts,
    currentConcept: initConcept,
    currentLocation: initLocation,

    setCurrent: (conceptId, locationId) => {
      set({ currentConcept: conceptId, currentLocation: locationId })
      persist()
    },
    addConcept: (name) => {
      const id = slug(name)
      const locId = uid('loc')
      set((s) => ({
        concepts: [...s.concepts, { id, name: name.trim(), locations: [{ id: locId, name: 'Main' }] }],
        currentConcept: id,
        currentLocation: locId,
      }))
      persist()
    },
    addLocation: (conceptId, name) => {
      const locId = uid('loc')
      set((s) => ({
        concepts: s.concepts.map((c) =>
          c.id === conceptId ? { ...c, locations: [...c.locations, { id: locId, name: name.trim() }] } : c,
        ),
        currentConcept: conceptId,
        currentLocation: locId,
      }))
      persist()
    },
    renameConcept: (conceptId, name) => {
      set((s) => ({
        concepts: s.concepts.map((c) => (c.id === conceptId ? { ...c, name: name.trim() } : c)),
      }))
      persist()
    },
    renameLocation: (conceptId, locId, name) => {
      set((s) => ({
        concepts: s.concepts.map((c) =>
          c.id === conceptId
            ? { ...c, locations: c.locations.map((l) => (l.id === locId ? { ...l, name: name.trim() } : l)) }
            : c,
        ),
      }))
      persist()
    },
    removeLocation: (conceptId, locId) => {
      set((s) => {
        const concepts = s.concepts.map((c) =>
          c.id === conceptId ? { ...c, locations: c.locations.filter((l) => l.id !== locId) } : c,
        )
        // Keep the current selection valid.
        let { currentConcept, currentLocation } = s
        if (currentLocation === locId) {
          const c = concepts.find((x) => x.id === currentConcept)
          currentLocation = c?.locations[0]?.id ?? ''
        }
        return { concepts, currentConcept, currentLocation }
      })
      persist()
    },
  }
})

/** Stable key fragment for the active location — used to namespace stored data. */
export function useScopeKey(): string {
  return useScope((s) => `${s.currentConcept}|${s.currentLocation}`)
}

export function useCurrentNames(): { concept: string; location: string } {
  // Select PRIMITIVES separately — returning a new object from a zustand
  // selector triggers an infinite render loop (each snapshot differs).
  const concept = useScope((s) => s.concepts.find((x) => x.id === s.currentConcept)?.name ?? '')
  const location = useScope((s) => {
    const c = s.concepts.find((x) => x.id === s.currentConcept)
    return c?.locations.find((x) => x.id === s.currentLocation)?.name ?? ''
  })
  return { concept, location }
}
