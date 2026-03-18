import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard,
  Upload,
  List,
  Wand2,
  BarChart2,
  User,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/', icon: LayoutDashboard },
  { label: 'Import', path: '/import', icon: Upload },
  { label: 'Transactions', path: '/transactions', icon: List },
  { label: 'Rules', path: '/rules', icon: Wand2 },
  { label: 'Stats', path: '/stats', icon: BarChart2 },
]

const BOTTOM_NAV: NavItem = { label: 'Profile', path: '/profile', icon: User }

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [expanded, setExpanded] = useState(false)
  const routerState = useRouterState()
  const { theme, setTheme } = useTheme()

  const pathname = routerState.location.pathname

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-gray-950">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 ${
          expanded ? 'w-56' : 'w-16'
        }`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo area */}
        <div className="flex h-14 items-center px-4 border-b border-gray-200 dark:border-gray-800 overflow-hidden">
          <span className="text-lg font-bold text-gray-900 dark:text-white shrink-0">L</span>
          {expanded && (
            <span className="ml-1 text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
              okfi
            </span>
          )}
        </div>

        {/* Top nav */}
        <nav className="flex-1 py-2 overflow-hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center h-10 px-4 gap-3 rounded-none transition-colors ${
                  isActive
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {expanded && (
                  <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Bottom nav */}
        <div className="py-2 border-t border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center h-10 px-4 gap-3 w-full text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {theme === 'dark' ? (
              <Sun size={18} className="shrink-0" />
            ) : (
              <Moon size={18} className="shrink-0" />
            )}
            {expanded && (
              <span className="text-sm font-medium whitespace-nowrap">
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </span>
            )}
          </button>

          {/* Profile */}
          <Link
            to={BOTTOM_NAV.path}
            className={`flex items-center h-10 px-4 gap-3 transition-colors ${
              pathname === BOTTOM_NAV.path
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <User size={18} className="shrink-0" />
            {expanded && (
              <span className="text-sm font-medium whitespace-nowrap">{BOTTOM_NAV.label}</span>
            )}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
