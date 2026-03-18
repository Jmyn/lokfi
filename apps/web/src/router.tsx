import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { ImportPage } from './pages/import/ImportPage'

const rootRoute = createRootRoute({
  component: () => (
    <ThemeProvider attribute="class">
      <Outlet />
    </ThemeProvider>
  ),
})

const importRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/import',
  component: ImportPage,
})

const routeTree = rootRoute.addChildren([importRoute])

export const router = createRouter({ routeTree })
