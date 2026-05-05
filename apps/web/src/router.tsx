import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { AppShell } from './layouts/AppShell'
import { FinancesPage } from './pages/finances/FinancesPage'
import { ImportPage } from './pages/import/ImportPage'
import { LandingPage } from './pages/landing/LandingPage'
import { InvestmentsPage } from './pages/investments/InvestmentsPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { RulesPage } from './pages/rules/RulesPage'
import { BrokerageSettingsPage } from './pages/settings/BrokerageSettingsPage'
import { TransactionsPage } from './pages/transactions/TransactionsPage'

const rootRoute = createRootRoute({
  component: () => (
    <ThemeProvider attribute="class">
      <Outlet />
    </ThemeProvider>
  ),
})

// Bare landing (no sidebar)
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})

// Shell layout wrapping all app pages
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})

const investmentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/investments',
  component: InvestmentsPage,
})

const importRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/import',
  component: ImportPage,
})

const transactionsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/transactions',
  component: TransactionsPage,
})

const financesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/finances',
  component: FinancesPage,
})

const profileRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/profile',
  component: ProfilePage,
})

const rulesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/rules',
  component: RulesPage,
})

const brokerageSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/brokerage',
  component: BrokerageSettingsPage,
})

const routeTree = rootRoute.addChildren([
  landingRoute,
  shellRoute.addChildren([
    investmentsRoute,
    importRoute,
    transactionsRoute,
    financesRoute,
    profileRoute,
    rulesRoute,
    brokerageSettingsRoute,
  ]),
])

export const router = createRouter({ routeTree })
