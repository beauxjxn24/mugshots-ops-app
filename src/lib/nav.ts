import {
  LayoutDashboard,
  PartyPopper,
  Moon,
  ListChecks,
  Sparkles,
  Banknote,
  ChefHat,
  PackageOpen,
  ReceiptText,
  ScanLine,
  TrendingUp,
  PieChart,
  Flame,
  BookOpen,
  GraduationCap,
  Martini,
  Boxes,
  DollarSign,
  BarChart3,
  CalendarDays,
  CalendarCheck,
  Users,
  Store,
  Cable,
  ClipboardList,
  Wrench,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** CSS class for the always-on motion applied to a plain Lucide icon. */
  idle?: string
  /** Shown to hourly staff in the focused "My Shift" experience. */
  staff?: boolean
}
export interface NavSection {
  title: string
  items: NavItem[]
  /** Rail icon for the whole area (command-rail nav). */
  areaIcon?: LucideIcon
}

export const NAV: NavSection[] = [
  {
    title: '',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    // Its own area, a single row near the top of the rail, rather than ninth
    // in a list of thirteen. Everything the app knows starts with a file
    // getting in, and a screen you have to hunt for is one that doesn't get
    // used — the Drop Box pill above the menu is the other half of that.
    title: 'Imports',
    areaIcon: ScanLine,
    items: [
      { to: '/imports', label: 'Imports', icon: ScanLine },
    ],
  },
  {
    title: 'Daily Ops',
    areaIcon: ChefHat,
    items: [
      { to: '/catering', label: 'Catering', icon: PartyPopper },
      { to: '/nightly', label: 'Nightly Numbers', icon: Moon },
      // Managers only. The open/close/weekly checklists are a manager's walk of
      // the building; an hourly's version of the same duties is their sidework,
      // which they already have. Two lists of duties under My Tasks just left
      // them guessing which one was theirs.
      { to: '/checklists', label: 'Checklists', icon: ListChecks },
      { to: '/sidework', label: 'Sidework', icon: Sparkles, staff: true },
      { to: '/tipshare', label: 'Tipshare', icon: Banknote },
      // Staff see this too — prep IS the shift for a cook, and it was the one
      // daily task missing from their menu. The screen itself is read-only for
      // them: counts editable, pars and setup are not.
      { to: '/prep', label: 'Prep', icon: ChefHat, staff: true },
      { to: '/ordering', label: 'Ordering', icon: PackageOpen },
      { to: '/invoices', label: 'Invoices', icon: ReceiptText },
      { to: '/petty', label: 'Petty Cash', icon: Wallet },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench },
      { to: '/printables', label: 'Printables', icon: ReceiptText },
    ],
  },
  {
    title: 'Training',
    areaIcon: BookOpen,
    items: [
      { to: '/forecast', label: 'Forecast', icon: TrendingUp },
      { to: '/mix', label: 'Product Mix', icon: PieChart },
      { to: '/lto', label: 'LTO', icon: Flame },
      { to: '/specs', label: 'Specs & Recipes', icon: BookOpen, staff: true },
      // staff: a bartender is hourly. Locking the drink builds to managers made
      // the one person who builds these all night the one person who couldn't
      // look one up. Same reasoning as Specs & Recipes above — it's reference,
      // not a control.
      { to: '/drinks', label: 'Signature Drinks', icon: Martini, staff: true },
      // staff: the people being certified against these are the ones who need
      // to read them. A study guide in a manager's folder trains nobody.
      //
      // LAST in this section on purpose. The phone's bottom bar takes the first
      // five staff items, and a bartender needs the drink builds every shift
      // while a certification packet gets read during onboarding — so Drinks
      // keeps the tab and this lives in the menu.
      { to: '/training', label: 'Training resources', icon: GraduationCap, staff: true },
    ],
  },
  {
    // Inventory is snoozed from the nav (still reachable at /inventory and via
    // the catalog's Count toggle) to keep the menu streamlined.
    // Named for the one screen it holds. "Supply" was a wrapper you had to open
    // before you could see it meant the item catalog.
    title: 'Item Catalog',
    areaIcon: Boxes,
    items: [
      { to: '/catalog', label: 'Item Catalog', icon: Boxes },
    ],
  },
  {
    // Costs is snoozed from the nav (still reachable at /costs) — same as
    // Inventory, to keep the menu to what gets used daily.
    title: 'Management',
    areaIcon: BarChart3,
    items: [
      { to: '/period', label: 'Period Review', icon: BarChart3 },
      { to: '/schedule', label: 'Mgr Schedule', icon: CalendarDays },
      // Managers only — the staff experience is the shift in front of you, and
      // the posted schedule was the one thing in My Tasks that wasn't a task.
      { to: '/posted', label: 'Posted schedule', icon: CalendarCheck },
      { to: '/staff', label: 'Staff', icon: Users },
      { to: '/users', label: 'Users & PINs', icon: Users },
      { to: '/stores', label: 'Stores & Concepts', icon: Store },
      { to: '/connections', label: 'Connections', icon: Cable },
    ],
  },
]

export const NAV_FLAT = NAV.flatMap((s) => s.items)

// ---- Roll-up (whole concept / company) experience ----
// Read-only reporting: the combined dashboard plus store management. Per-store
// editing screens are hidden so nothing gets written to a phantom "all" store.
export const ROLLUP_SECTIONS: NavSection[] = [
  {
    title: '',
    items: [{ to: '/', label: 'Combined roll-up', icon: BarChart3 }],
  },
  {
    title: 'Company',
    areaIcon: Store,
    items: [
      { to: '/stores', label: 'Stores & Concepts', icon: Store },
      { to: '/connections', label: 'Connections', icon: Cable },
    ],
  },
]

// ---- Staff ("My Shift") experience ----
export const SHIFT_ITEM: NavItem = {
  to: '/shift',
  label: 'My Shift',
  icon: ClipboardList,
}
const STAFF_ITEMS = NAV_FLAT.filter((i) => i.staff)
export const STAFF_SECTIONS: NavSection[] = [
  { title: '', items: [SHIFT_ITEM] },
  { title: 'My Tasks', items: STAFF_ITEMS, areaIcon: ListChecks },
]
/** Bottom-bar items per experience. Managers/admins on a phone live in the
 *  invoice → inventory → ordering flow; hourly staff get My Shift + tasks. */
export const bottomItems = (role: 'admin' | 'manager' | 'staff'): NavItem[] =>
  role === 'staff'
    ? [SHIFT_ITEM, ...STAFF_ITEMS].slice(0, 5)
    : [
        NAV_FLAT[0],
        NAV_FLAT.find((i) => i.to === '/imports')!,
        NAV_FLAT.find((i) => i.to === '/nightly')!,
        NAV_FLAT.find((i) => i.to === '/ordering')!,
        NAV_FLAT.find((i) => i.to === '/invoices')!,
      ]
