// Real Mugshots sidework, transcribed from the store's server/host/bar duty sheet.
// Structure: Role → Shift phase → named Section → tasks.

export interface Section {
  section: string
  tasks: string[]
}
export type Phase = string
export type Role = 'Server' | 'Host & To-Go' | 'Bar'

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
        section: 'Section 6',
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
        section: 'Section 6',
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
        section: 'Section 6',
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
  'Host & To-Go': {
    Opening: [
      { section: 'To-Go', tasks: ['Count register for accuracy', 'Lock register'] },
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
  Bar: {
    Opening: [
      {
        section: 'Bar',
        tasks: [
          'Put out the bar mats',
          'Remove all tap and liquor covers',
          'Cut fresh fruit for fruit holder',
          'Fill ice bin',
          'Check and restock any empty kegs or liquor bottles',
          'Restock straws, bev naps, and drink coasters',
          'All liquor bottles wiped with damp towel',
          'All beer coolers cleaned, organized, restocked, and beer fronted',
          'Count register for accuracy',
          'Lock register',
        ],
      },
    ],
    Closing: [
      {
        section: 'Bar',
        tasks: [
          'All mats pulled and cleaned',
          'All taps and liquor bottles covered',
          'Fruits covered and put in cooler',
          'Beer cooler stocked and beer pulled to front at end of shift',
          'Fill ice bin (except Thursday — ice will be burned)',
          'All beer coolers cleaned, organized, restocked, and beer fronted',
          'Bar cleaned, swept, and mopped',
          'NO empty kegs left in cooler for any reason',
        ],
      },
    ],
  },
}

export const ROLES = Object.keys(SIDEWORK) as Role[]
export const phasesFor = (role: Role): Phase[] => Object.keys(SIDEWORK[role])
