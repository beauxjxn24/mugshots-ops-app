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
  Martini,
  Boxes,
  DollarSign,
  BarChart3,
  CalendarDays,
  Users,
  Store,
  Cable,
  ClipboardList,
  Wrench,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { ComponentType } from 'react'
import {
  FlameIcon,
  SparkleIcon,
  MoonZIcon,
  ClockIcon,
  BarsIcon,
  ShakerIcon,
  PopperIcon,
  CheckBoxIcon,
  ChefIcon,
  BoxIcon,
  ScanDocIcon,
  GraphIcon,
  PieSpinIcon,
  CoinIcon,
  BoltIcon,
  PlugIcon,
  GridIcon,
  ReceiptIcon,
  BookIcon,
  StackIcon,
  WalletIcon,
  PeopleIcon,
  StorefrontIcon,
  KeyTurnIcon,
} from '../components/icons/AnimatedIcons'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  color: string
  /** Optional custom animated icon, rendered instead of `icon`. */
  anim?: ComponentType<{ size?: number; className?: string }>
  /** CSS class for the always-on motion applied to a plain Lucide icon. */
  idle?: string
  /** Shown to hourly staff in the focused "My Shift" experience. */
  staff?: boolean
}
export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: '',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#E4B84C', anim: GridIcon }],
  },
  {
    title: 'Daily Ops',
    items: [
      { to: '/catering', label: 'Catering', icon: PartyPopper, color: '#E0559B', anim: PopperIcon },
      { to: '/nightly', label: 'Nightly Numbers', icon: Moon, color: '#818CF8', anim: MoonZIcon },
      { to: '/checklists', label: 'Checklists', icon: ListChecks, color: '#34D399', anim: CheckBoxIcon, staff: true },
      { to: '/sidework', label: 'Sidework', icon: Sparkles, color: '#2DD4BF', anim: SparkleIcon, staff: true },
      { to: '/tipshare', label: 'Tipshare', icon: Banknote, color: '#4ADE80', anim: CoinIcon, staff: true },
      { to: '/prep', label: 'Prep', icon: ChefHat, color: '#FB7185', anim: ChefIcon, staff: true },
      { to: '/ordering', label: 'Ordering', icon: PackageOpen, color: '#F0A94C', anim: BoxIcon },
      { to: '/invoices', label: 'Invoices', icon: ReceiptText, color: '#A78BFA', anim: ReceiptIcon },
      { to: '/imports', label: 'Imports', icon: ScanLine, color: '#38BDF8', anim: ScanDocIcon },
    ],
  },
  {
    title: 'Menu & Sales',
    items: [
      { to: '/forecast', label: 'Forecast', icon: TrendingUp, color: '#4ADE80', anim: GraphIcon },
      { to: '/mix', label: 'Product Mix', icon: PieChart, color: '#FB923C', anim: PieSpinIcon },
      { to: '/lto', label: 'LTO', icon: Flame, color: '#F87171', anim: FlameIcon },
      { to: '/specs', label: 'Specs & Recipes', icon: BookOpen, color: '#E4B84C', anim: BookIcon, staff: true },
      { to: '/builds', label: 'Line Builds', icon: ChefHat, color: '#FB7185', anim: GridIcon, staff: true },
      { to: '/drinks', label: 'Signature Drinks', icon: Martini, color: '#F472B6', anim: ShakerIcon },
    ],
  },
  {
    title: 'Supply',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes, color: '#2DD4BF', anim: StackIcon },
      { to: '/catalog', label: 'Item Catalog', icon: Boxes, color: '#2DD4BF', anim: StackIcon },
    ],
  },
  {
    title: 'Management',
    items: [
      { to: '/costs', label: 'Costs', icon: DollarSign, color: '#4ADE80', anim: CoinIcon },
      { to: '/petty', label: 'Petty Cash', icon: Wallet, color: '#4ADE80', anim: WalletIcon },
      { to: '/maintenance', label: 'Maintenance', icon: Wrench, color: '#94A3B8', anim: BoltIcon },
      { to: '/period', label: 'Period Review', icon: BarChart3, color: '#A78BFA', anim: BarsIcon },
      { to: '/schedule', label: 'Mgr Schedule', icon: CalendarDays, color: '#60A5FA', anim: ClockIcon },
      { to: '/staff', label: 'Staff', icon: Users, color: '#F472B6', anim: PeopleIcon },
      { to: '/users', label: 'Users & PINs', icon: Users, color: '#E4B84C', anim: KeyTurnIcon },
      { to: '/printables', label: 'Printables', icon: ReceiptText, color: '#94A3B8', anim: ScanDocIcon },
      { to: '/stores', label: 'Stores & Concepts', icon: Store, color: '#E4B84C', anim: StorefrontIcon },
      { to: '/connections', label: 'Connections', icon: Cable, color: '#38BDF8', anim: PlugIcon },
    ],
  },
]

export const NAV_FLAT = NAV.flatMap((s) => s.items)

// ---- Staff ("My Shift") experience ----
export const SHIFT_ITEM: NavItem = {
  to: '/shift',
  label: 'My Shift',
  icon: ClipboardList,
  color: '#E4B84C',
}
const STAFF_ITEMS = NAV_FLAT.filter((i) => i.staff)
export const STAFF_SECTIONS: NavSection[] = [
  { title: '', items: [SHIFT_ITEM] },
  { title: 'My Tasks', items: STAFF_ITEMS },
]
/** Bottom-bar items per experience. */
export const bottomItems = (role: 'manager' | 'staff'): NavItem[] =>
  role === 'staff'
    ? [SHIFT_ITEM, ...STAFF_ITEMS].slice(0, 5)
    : [
        NAV_FLAT[0],
        NAV_FLAT.find((i) => i.to === '/prep')!,
        NAV_FLAT.find((i) => i.to === '/ordering')!,
        NAV_FLAT.find((i) => i.to === '/specs')!,
        NAV_FLAT.find((i) => i.to === '/inventory')!,
      ]
