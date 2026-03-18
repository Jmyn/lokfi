import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { AppShell } from './layouts/AppShell'
import { LandingPage } from './pages/landing/LandingPage'
import { ImportPage } from './pages/import/ImportPage'
import { TransactionsPage } from './pages/transactions/TransactionsPage'
import { StatsPage } from './pages/stats/StatsPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { RulesPage } from './pages/rules/RulesPage'

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

const statsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/stats',
  component: StatsPage,
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

const routeTree = rootRoute.addChildren([
  landingRoute,
  shellRoute.addChildren([importRoute, transactionsRoute, statsRoute, profileRoute, rulesRoute]),
])

export const router = createRouter({ routeTree })
