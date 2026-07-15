import { type ReactNode } from 'react'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import { ConfirmDialog } from './components/ConfirmDialog'
import { AppShell } from './components/AppShell'
import { Dashboard } from './routes/Dashboard'
import { Combined } from './routes/Combined'
import { Shift } from './routes/Shift'
import { useRole } from './lib/role'
import { useRollupLevel } from './lib/scope'
import { Specs } from './routes/Specs'
import { Imports } from './routes/Imports'
import { Connections } from './routes/Connections'
import { Tipshare } from './routes/Tipshare'
import { Prep } from './routes/Prep'
import { Ordering } from './routes/Ordering'
import { Inventory } from './routes/Inventory'
import { Sidework } from './routes/Sidework'
import { Drinks } from './routes/Drinks'
import { LTO } from './routes/LTO'
import { Catering } from './routes/Catering'
import { Staff } from './routes/Staff'
import { Nightly } from './routes/Nightly'
import { Checklists } from './routes/Checklists'
import { Stores } from './routes/Stores'
import { Invoices } from './routes/Invoices'
import { Costs } from './routes/Costs'
import { Catalog } from './routes/Catalog'
import { Maintenance } from './routes/Maintenance'
import { PettyCash } from './routes/PettyCash'
import { Forecast } from './routes/Forecast'
import { Mix } from './routes/Mix'
import { Period } from './routes/Period'
import { Schedule } from './routes/Schedule'
import { Posted } from './routes/Posted'
import { Users } from './routes/Users'
import { LineBuilds } from './routes/LineBuilds'
import { Printables } from './routes/Printables'
import { PinDialog } from './components/PinDialog'
import { Mugsy } from './components/Mugsy'
import { Placeholder } from './routes/Placeholder'

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'combined', element: <Combined /> },
      { path: 'shift', element: <Shift /> },
      { path: 'specs', element: <Specs /> },
      { path: 'imports', element: <Imports /> },
      { path: 'connections', element: <Connections /> },
      // Sections still being rebuilt render a consistent placeholder.
      { path: 'tipshare', element: <Tipshare /> },
      { path: 'prep', element: <Prep /> },
      { path: 'ordering', element: <Ordering /> },
      { path: 'inventory', element: <Inventory /> },
      { path: 'catalog', element: <Catalog /> },
      { path: 'sidework', element: <Sidework /> },
      { path: 'catering', element: <Catering /> },
      { path: 'nightly', element: <Nightly /> },
      { path: 'lto', element: <LTO /> },
      { path: 'drinks', element: <Drinks /> },
      { path: 'staff', element: <Staff /> },
      { path: 'stores', element: <AdminOnly><Stores /></AdminOnly> },
      { path: 'checklists', element: <Checklists /> },
      { path: 'invoices', element: <Invoices /> },
      { path: 'costs', element: <Costs /> },
      { path: 'petty', element: <PettyCash /> },
      { path: 'maintenance', element: <Maintenance /> },
      { path: 'forecast', element: <Forecast /> },
      { path: 'mix', element: <Mix /> },
      { path: 'period', element: <Period /> },
      { path: 'schedule', element: <Schedule /> },
      { path: 'posted', element: <Posted /> },
      { path: 'users', element: <Users /> },
      { path: 'builds', element: <LineBuilds /> },
      { path: 'printables', element: <Printables /> },
      { path: '*', element: <Placeholder /> },
    ],
  },
])

/** Role-aware home: staff get My Shift; the admin gets the combined roll-up when
 *  a whole-concept / company scope is selected; everyone else gets their own
 *  single-store Dashboard. A non-admin can never land on the cross-store view. */
function Home() {
  const role = useRole((s) => s.role)
  const level = useRollupLevel()
  if (role === 'staff') return <Shift />
  return role === 'admin' && level !== 'single' ? <Combined /> : <Dashboard />
}

/** Gate a route to the admin (owner). Managers/staff are bounced to their
 *  own dashboard instead of seeing cross-store management screens. */
function AdminOnly({ children }: { children: ReactNode }) {
  const role = useRole((s) => s.role)
  return role === 'admin' ? <>{children}</> : <Dashboard />
}

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ConfirmDialog />
      <PinDialog />
      <Mugsy />
    </>
  )
}
