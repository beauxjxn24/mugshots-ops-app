// The training library — the documents a team member is trained and certified
// against, kept where they can actually reach them.
//
// These are the store's own ExpandShare packets. They arrived while the kitchen
// station sidework was being built, and they are NOT closing checklists: each
// one is a five-day training and certification programme — a day-by-day
// schedule, a menu-build test per day, and a sign-off. Filing them as duty
// lists would have been wrong, so they get their own shelf.
//
// Staff-visible on purpose. A packet a cook is certified against is no use in a
// manager's folder, and "where's the study guide" is the question this answers.

export interface Resource {
  /** Stable id — used in the URL, so don't rename it once it's out. */
  id: string
  title: string
  /** What it actually is, in one line, so nobody opens it hunting a checklist. */
  what: string
  /** Which station or job it belongs to. Groups the list. */
  group: string
  /** Served from public/training — not bundled into the app's JavaScript. */
  file: string
  pages: number
}

export const TRAINING: Resource[] = [
  {
    id: 'flat-top-salad',
    title: 'Flat Top & Salad Station',
    what: 'Five-day training schedule, a menu-build test for each day, and station certification.',
    group: 'Kitchen stations',
    file: 'training/flat-top-salad-station.pdf',
    pages: 9,
  },
  {
    id: 'grill-middle',
    title: 'Grill & Middle Station',
    what: 'Five-day training schedule, a menu-build test for each day, and station certification.',
    group: 'Kitchen stations',
    file: 'training/grill-middle-station.pdf',
    pages: 9,
  },
]

/** In the order the groups should read, with anything new falling in at the end. */
export const TRAINING_GROUPS = (): string[] => {
  const order = ['Kitchen stations', 'Front of house', 'Bar', 'Management']
  const present = [...new Set(TRAINING.map((r) => r.group))]
  return [
    ...order.filter((g) => present.includes(g)),
    ...present.filter((g) => !order.includes(g)),
  ]
}

export const resourceById = (id: string): Resource | undefined =>
  TRAINING.find((r) => r.id === id)

/** Where the file actually lives, honouring the app's base path. */
export const resourceUrl = (r: Resource): string => `${import.meta.env.BASE_URL}${r.file}`
