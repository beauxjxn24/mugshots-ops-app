// Real Mugshots sidework, transcribed from the store's server/host/bar duty sheet.
// Structure: Role → Shift phase → named Section → tasks.

export interface Section {
  section: string
  tasks: string[]
}
export type Phase = string
/**
 * A duty sheet belongs to a job, or to a station.
 *
 * The four front-of-house ones came off the store's own laminated sheet. The
 * kitchen ones are STATIONS, not jobs — the flat top gets closed by whoever is
 * on it — and they're kept in their own group because nine tabs in one row is
 * unreadable on a phone, and because a cook has no business scrolling the
 * host's list to find the fryers.
 *
 * Deliberately not a fixed set any more. Every kitchen runs different stations,
 * so this stays open and a manager can add their own; ROLES reads whatever the
 * store's sheet actually holds.
 */
export type Role = string
export const FOH_ROLES = ['Server', 'Host', 'To-Go', 'Bar']

export const SIDEWORK: Record<Role, Record<Phase, Section[]>> = {
  Server: {
    'AM Opening': [
      {
        section: 'Section 1',
        tasks: [
          'Refill and stock all sauce pans and bottles',
          '1 full pan in bottom cooler, 1 full pan on top (Mon–Thu)',
          '2 full pans in bottom cooler, 1 full pan on top (Fri–Sun)',
          'Label and initial all sauce pans and bottles',
          'Check section — set up for a busy, successful shift',
        ],
      },
      {
        section: 'Section 2',
        tasks: [
          'Sweep parking (Section 3 M–F)',
          'Clean and restock restrooms (Section 3 M–F)',
          'Check section — set up for a busy, successful shift',
        ],
      },
      {
        section: 'Section 3',
        tasks: [
          'Brew tea for dining room',
          'Set up drink station for dining room',
          'Restock ice, cups, lids, and straws for dining room',
          'Check section — set up for a busy, successful shift',
        ],
      },
      {
        section: 'Section 4',
        tasks: [
          'Brew tea for bar side',
          'Set up drink station for bar area',
          'Restock cups, lids, ice, and straws for bar side',
          'Check section — set up for a busy, successful shift',
        ],
      },
      {
        section: 'Section 5',
        tasks: [
          'Cut lemons for dining & bar side for the entire day (Section 4 M–F)',
          'Check section — set up for a busy, successful shift',
        ],
      },
    ],
    'AM Closing': [
      {
        section: 'Section 1',
        tasks: [
          'Restock sauce pans and bottles',
          'Wipe down sauce cooler and ice cream cooler',
          'Wipe down food and drink trays',
          'Clean, sweep, and restock section',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing server before turning in checkout',
        ],
      },
      {
        section: 'Section 2',
        tasks: [
          'Clean, sweep, and restock section',
          'Clean and empty restroom trash',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing server before turning in checkout',
        ],
      },
      {
        section: 'Section 3',
        tasks: [
          'Restock tea, ice, and cups for dining room',
          'Empty all FOH trash cans',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing server before turning in checkout',
        ],
      },
      {
        section: 'Section 4',
        tasks: [
          'Restock tea, ice, cups, and lids for bar area',
          'Roll silverware',
          'Connect handheld to charging dock',
        ],
      },
      {
        section: 'Section 5',
        tasks: [
          'Restock drink station for dining side',
          'Check restrooms',
          'Roll silverware',
          'Connect handheld to charging dock',
        ],
      },
    ],
    'PM Closing': [
      {
        section: 'Section 1',
        tasks: [
          'Refill and restock all sauce bottles and pans',
          '2 full pans in bottom cooler, 1 full pan on top (Mon–Thu)',
          '3 full pans in bottom cooler, 1 full pan on top (Fri–Sun)',
          'Wipe down food and drink trays',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing servers before turning in checkout',
          'Clean, restock, and sweep section',
        ],
      },
      {
        section: 'Section 2',
        tasks: [
          'Take out all FOH trash',
          'Clean, sweep, restock section',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing servers before turning in checkout',
        ],
      },
      {
        section: 'Section 3',
        tasks: [
          'Break down dining room drink station',
          'Restock ice, cups, straws, and lids',
          'Clean, sweep, restock section',
          'Roll silverware',
          'Connect handheld to charging dock',
          'Get signatures from closing servers before turning in checkout',
        ],
      },
      {
        section: 'Section 4',
        tasks: [
          'Check sections 1–3 sidework — ensure everything is done before checkout',
          'Mop dining room',
          'Empty trash in bathrooms — ensure clean for next morning',
          'Clean, sweep, and restock section',
          'Spray patio',
          'Roll silverware',
          'Ensure all handhelds are connected to dock',
        ],
      },
      {
        section: 'Section 5',
        tasks: [
          'Check sections 1–3 — clean, swept, and stocked before checkout',
          'Mop bar area and both bathrooms',
          'Break down bar drink station',
          'Clean, sweep, restock section',
          'Roll silverware',
          'Ensure all handhelds are connected to dock',
        ],
      },
    ],
  },
  // Host and To-Go are two jobs, cut separately -- one sheet with a section
  // each meant cutting the host cut the To-Go stand with them.
  Host: {
    Opening: [
      {
        section: 'Host',
        tasks: [
          'Ensure rugs are rolled out and swept',
          'Menus wiped and cleaned',
          'Silverware bin is filled',
          'Kids menu and crayons are stocked',
          'Ensure sanitizer buckets are filled and placed in FOH',
          'Windows and doors are cleaned',
        ],
      },
    ],
    Closing: [
      {
        section: 'Host',
        tasks: [
          'Wipe ALL menus — clean for next morning',
          'Rugs swept and rolled',
          'Host stand clean and organized',
          'Glass windows and doors cleaned',
        ],
      },
    ],
  },
  'To-Go': {
    Opening: [
      { section: 'To-Go', tasks: ['Count register for accuracy', 'Lock register'] },
    ],
    Closing: [
      {
        section: 'To-Go',
        tasks: [
          'All to-go orders are closed',
          'All employee meals paid through Host To-Go at purchase (do NOT transfer unpaid tabs to bartender)',
          'Ensure iPad is connected to charger',
          'No orders left behind To-Go stand',
          'Clean, sweep, and organize Host To-Go stand',
          'Ensure cordless phone is on the charger',
          'Wipe counter before clocking out',
        ],
      },
    ],
  },
  Bar: {
    'AM Opening': [
      {
        section: 'AM Bartenders',
        tasks: [
          'Stock: liquor, beer, wine, fruit, silverware, ketchup, lids, napkins, straws, ToGo boxes, cups, salt, bev naps, 2 oz cups & lids',
          'Stock, clean, sweep your tables (if applicable)',
          'Sweep under bar stools',
          'Wipe down frozen machine & drip catcher on machine',
          'Restock clean glassware',
          'Check sour & straw lemonade',
          'Fill ice bins',
          'Wipe cooler sliding doors & rails',
          'Take out the trash. Clean cans as needed',
          'Clean & sanitize bar',
          'Do weekly side work',
        ],
      },
    ],
    'PM Closing': [
      {
        section: 'PM Bartenders',
        tasks: [
          'Clean & sanitize bar top',
          'Stock, clean, sweep your tables',
          'Restock clean glassware',
          'Check sour & strawberry lemonade',
          'Fill ice bins',
          'Wipe cooler sliding doors & rails',
          'Clean & sanitize all ice bin covers & accessories',
          'Breakdown, WIPE, & soak soda guns overnight',
          'Wipe beer nozzles & cover with dust caps',
          'Wipe all bottles & liquor rails',
          'Cover all speed pours with dust caps',
          'Wash bar supplies (mats, shakers, fruit tray, tier rimmer, etc)',
          'Clean ALL stainless surface areas',
          'Take out the trash. Clean cans as needed',
          'Sweep/scrub/squeegee or mop bar area',
          'Flip bar stools & sweep around the bar',
          'Wipe down frozen machine & drip catcher on machine',
          'Do weekly side work',
        ],
      },
    ],
  },
  /**
   * ── Kitchen stations ────────────────────────────────────────────────────
   *
   * A STARTING POINT, not the store's list. Unlike everything above, this
   * wasn't transcribed off a laminated sheet — there wasn't one to transcribe.
   * The flat top and the fryers are the two that were named; the rest is what
   * closing those stations normally involves, so nobody starts from a blank
   * screen on the first night.
   *
   * Every line is editable in the app and saved per store, and a manager can
   * add stations this doesn't have. Expect all of it to be rewritten, and treat
   * the version on the tablet as the real one.
   */
  // Named the way the store's own training packet names it — "Flat Top - Salad
  // Station" — rather than the "Flat" I'd picked. The first three lines are
  // that packet's wording too; the rest is still a guess.
  'Flat Top - Salad': {
    'PM Closing': [
      {
        section: 'Flat top',
        tasks: [
          'Break down the station',
          'Clean the flat top and the microwave',
          'Make sure all necessary supplies are available for the morning',
          'Scrape the flat down while it’s still hot',
          'Empty and wash the grease trap',
          'Wipe the splash guard and the front rail',
          'Break down, wash and dry the spatulas and weights',
        ],
      },
      {
        section: 'Salad station',
        tasks: [
          'Wrap, date and put away the setup pans',
          'Wipe the reach-in handles and the low-boy gaskets',
          'Restock dressings and portion cups',
          'Sweep and squeegee the station',
        ],
      },
    ],
  },
  Fry: {
    'PM Closing': [
      {
        section: 'Fryers',
        tasks: [
          'Filter the fryers',
          'Skim and boil out on the schedule',
          'Wipe the fryer cabinets and the surrounds',
          'Wash the baskets and the shaker pans',
          'Change the oil when it’s due — log it',
          'Restock breading and shakers for the morning',
          'Sweep and squeegee the station',
        ],
      },
    ],
  },
  Grill: {
    'PM Closing': [
      {
        section: 'Grill',
        tasks: [
          'Burn off and brush the grates',
          'Empty the grease drawer',
          'Wipe the hood lip and the side shelves',
          'Break down and wash the tongs and spatulas',
          'Wrap, date and put away the setup pans',
          'Sweep and squeegee the station',
        ],
      },
    ],
  },
  Dish: {
    'PM Closing': [
      {
        section: 'Dish',
        tasks: [
          'Run the last racks and drain the machine',
          'Delime and wipe the machine, screens out and rinsed',
          'Empty, wash and refill the three-compartment sink',
          'Break down the drain boards; scrub the floor mats',
          'Trash and cardboard out',
          'Sweep and mop the dish area',
        ],
      },
    ],
  },
}

export const ROLES = Object.keys(SIDEWORK) as Role[]
export const phasesFor = (role: Role): Phase[] => Object.keys(SIDEWORK[role] ?? {})
/** Kitchen stations are whatever isn't one of the four front-of-house jobs. */
export const isStation = (r: Role): boolean => !FOH_ROLES.includes(r)


/**
 * The bar's weekly side work — one AM job and one PM job per day, off the
 * laminated sheet behind the bar. Kept apart from the daily lists because it is
 * indexed by the day of the week, which the daily sheets are not; the app shows
 * today's line alongside whichever daily list is open.
 *
 * Monday-first, matching the prep sheet.
 */
export const BAR_WEEKLY: { AM: string; PM: string }[] = [
  {
    AM: 'Burn ice & detail ice bins deep & fill back up',
    PM: 'Clean & wipe down all legs on bar chairs',
  },
  {
    AM: 'Clean & organize display shelf & grenadine corner (wipe down all bottles on shelf & grenadine corner)',
    PM: 'Clean, organize & restock ice storage & ToGo corner',
  },
  {
    AM: 'All rails cleaned and wiped down (includes mats and bottles)',
    PM: 'Sweep & detail entire floor behind bar',
  },
  {
    AM: 'Detail inside & out of all 3 coolers (mugs / tequila / juice coolers)',
    PM: 'Organize & detail POS and storage areas',
  },
  {
    AM: 'Clean & wipe underneath all mats under glassware',
    PM: 'Organize & clean beer bottle cooler (inside & glass doors)',
  },
  {
    AM: 'Clean & wipe down all walls in keg room',
    PM: 'Sweep & mop out keg room floor',
  },
  {
    AM: 'Detail all sinks & legs under sinks',
    PM: 'Clean frozen machine & filter on the side. Leave empty to dry overnight (includes the lids, inside and drip catcher)',
  },
]

/** Speed pours are soaked, cleaned and left to dry on these days (Mon-first). */
export const SPEED_POUR_DAYS = [1, 3, 6]

/** The sheet's own warning, carried through to the screen. */
export const BAR_WEEKLY_NOTE =
  'If not done, write-ups will be given and bar shifts will be taken away.'
