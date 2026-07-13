import type { IntegrationSource } from './types'

/**
 * Integration catalog. Every provider the app can talk to lives here; the
 * venue's actual stack is flagged with `inUse`. Anything not listed is still
 * covered by the universal drop-box reader (PDF / photo / CSV).
 *
 *  mode 'api'  → live sync once credentials are connected (needs backend)
 *  mode 'file' → handled today by the drop-box reader
 */
export interface Provider extends IntegrationSource {
  category: 'POS' | 'Broadline' | 'Produce' | 'Catering' | 'Delivery' | 'Payroll' | 'Accounting'
  automation: string[]
  apiAvailable: boolean
  inUse: boolean
}

export const PROVIDERS: Provider[] = [
  // ---- Point of sale ----
  { id: 'toast', kind: 'pos', provider: 'toast', label: 'Toast', category: 'POS', mode: 'api', apiAvailable: true, connected: false, inUse: true,
    automation: ['Auto-pull net sales, labor % and product mix nightly', 'Push tracked-item counts to the Dashboard', 'Flag comp/void spikes'] },
  { id: 'square', kind: 'pos', provider: 'square', label: 'Square', category: 'POS', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Sales & labor sync', 'Menu / item mix'] },
  { id: 'clover', kind: 'pos', provider: 'clover', label: 'Clover', category: 'POS', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Sales & labor sync'] },
  { id: 'aloha', kind: 'pos', provider: 'aloha', label: 'NCR Aloha', category: 'POS', mode: 'file', apiAvailable: false, connected: false, inUse: false,
    automation: ['Import daily sales export'] },

  // ---- Broadline distributors ----
  { id: 'usfoods', kind: 'vendor', provider: 'us-foods', label: 'US Foods', category: 'Broadline', mode: 'api', apiAvailable: true, connected: false, inUse: true,
    automation: ['Sync order guide + pricing', 'Auto-import invoices to inventory', 'Alert on price increases vs last order'] },
  { id: 'sysco', kind: 'vendor', provider: 'sysco', label: 'Sysco', category: 'Broadline', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Order guide + invoice sync'] },
  { id: 'pfg', kind: 'vendor', provider: 'pfg', label: 'Performance Food Group', category: 'Broadline', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Order guide + invoice sync'] },
  { id: 'gordon', kind: 'vendor', provider: 'gfs', label: 'Gordon Food Service', category: 'Broadline', mode: 'file', apiAvailable: false, connected: false, inUse: false,
    automation: ['Drop-box invoice import'] },

  // ---- Produce / specialty ----
  { id: 'gulfcoast', kind: 'vendor', provider: 'gulf-coast-produce', label: 'Gulf Coast Produce', category: 'Produce', mode: 'file', apiAvailable: false, connected: false, inUse: true,
    automation: ['Read dropped order guides & invoices (PDF / photo)', 'Auto-match line items to inventory'] },

  // ---- Catering marketplaces ----
  { id: 'ezcater', kind: 'pos', provider: 'ezcater', label: 'ezCater', category: 'Catering', mode: 'api', apiAvailable: true, connected: false, inUse: true,
    automation: ['Auto-add catering orders to the calendar', 'Generate party prep sheet per order'] },

  // ---- Delivery marketplaces ----
  { id: 'doordash', kind: 'pos', provider: 'doordash', label: 'DoorDash', category: 'Delivery', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Pull delivery sales into the mix'] },
  { id: 'ubereats', kind: 'pos', provider: 'ubereats', label: 'Uber Eats', category: 'Delivery', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Pull delivery sales into the mix'] },

  // ---- Back office ----
  { id: 'quickbooks', kind: 'vendor', provider: 'quickbooks', label: 'QuickBooks', category: 'Accounting', mode: 'api', apiAvailable: true, connected: false, inUse: false,
    automation: ['Export invoices & sales to accounting'] },
]

export const CATEGORIES = ['POS', 'Broadline', 'Produce', 'Catering', 'Delivery', 'Accounting'] as const
