import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'
import {
  Upload,
  List,
  Wand2,
  User,
  Sun,
  Moon,
  Pin,
  PinOff,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Import', path: '/import', icon: Upload },
  { label: 'Transactions', path: '/transactions', icon: List },
  { label: 'Rules', path: '/rules', icon: Wand2 },
]

const BOTTOM_NAV: NavItem = { label: 'Profile', path: '/profile', icon: User }

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [pinned, setPinned] = useState(() => localStorage.getItem('sidebar-pinned') === 'true')
  const [hovered, setHovered] = useState(false)
  const routerState = useRouterState()
  const { theme, setTheme } = useTheme()

  const pathname = routerState.location.pathname
  const expanded = pinned || hovered

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r transition-all duration-200 ${
          expanded ? 'w-56' : 'w-16'
        }`}
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderColor: 'var(--border)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Logo area */}
        <div
          className="flex h-14 items-center justify-between px-3 border-b overflow-hidden"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Brand mark — amber diamond */}
            <span
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-white text-xs font-bold"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              ◆
            </span>
            {expanded && (
              <span className="font-serif text-base font-normal text-gray-900 dark:text-white whitespace-nowrap tracking-tight">
                Lokfi
              </span>
            )}
          </div>
          {expanded && (
            <button
              onClick={() => {
                const next = !pinned
                localStorage.setItem('sidebar-pinned', String(next))
                setPinned(next)
                if (!next) setHovered(false)
              }}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
              className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>
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
                className={`relative flex items-center h-10 px-4 gap-3 transition-colors ${
                  isActive
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: 'var(--accent-subtle)',
                        borderLeft: '2px solid var(--accent)',
                        paddingLeft: 'calc(1rem - 2px)',
                      }
                    : {}
                }
              >
                <Icon
                  size={17}
                  className="shrink-0"
                  style={isActive ? { color: 'var(--accent)' } : {}}
                />
                {expanded && (
                  <span className="text-sm font-medium whitespace-nowrap overflow-hidden">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 border-t" style={{ borderColor: 'var(--border)' }} />

        {/* Bottom nav */}
        <div className="py-2 overflow-hidden">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center h-10 px-4 gap-3 w-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            {theme === 'dark' ? (
              <Sun size={17} className="shrink-0" />
            ) : (
              <Moon size={17} className="shrink-0" />
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
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
            style={
              pathname === BOTTOM_NAV.path
                ? {
                    backgroundColor: 'var(--accent-subtle)',
                    borderLeft: '2px solid var(--accent)',
                    paddingLeft: 'calc(1rem - 2px)',
                  }
                : {}
            }
          >
            <User
              size={17}
              className="shrink-0"
              style={pathname === BOTTOM_NAV.path ? { color: 'var(--accent)' } : {}}
            />
            {expanded && (
              <span className="text-sm font-medium whitespace-nowrap">{BOTTOM_NAV.label}</span>
            )}
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--bg)' }}>
        {children}
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
